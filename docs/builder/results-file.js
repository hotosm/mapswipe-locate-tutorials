import { checkResults, isGzip, projectLink, projectResults } from "./results-tools.js";

export async function unpacked(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (!isGzip(bytes)) return blob;
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).blob();
}

// Large projects unpack to more text than a browser string holds, so the file is read in chunks and the unused geom column dropped.
export async function readCsv(blob) {
  const file = await unpacked(blob);
  const rows = await new Promise((resolve, reject) => {
    const collected = [];
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      chunk: (results, parser) => {
        if (results.errors.length > 0) {
          reject(new Error(`The CSV could not be read: ${results.errors[0].message} (row ${results.errors[0].row}).`));
          parser.abort();
          return;
        }
        for (const row of results.data) {
          delete row.geom;
          collected.push(row);
        }
      },
      complete: () => resolve(collected),
      error: (error) => reject(new Error(`The CSV could not be read: ${error.message}.`)),
    });
  });
  checkResults(rows);
  return rows;
}

async function fetchOk(url, description) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The ${description} failed to load (HTTP ${response.status}).`);
  return response;
}

// Returns the project name, the results file name without extensions, and its rows.
export async function loadProject(link) {
  const source = projectLink(link);
  let project = { results: source.results };
  if (source.page) {
    const pageResponse = await fetchOk(source.page, "project page");
    project = projectResults(await pageResponse.text());
  }
  const resultsResponse = await fetchOk(project.results, "results file");
  const rows = await readCsv(await resultsResponse.blob());
  const fileName = new URL(project.results).pathname.split("/").pop().replace(/\.gz$/, "").replace(/\.csv$/, "");
  return { name: project.name ?? fileName, fileName, rows };
}
