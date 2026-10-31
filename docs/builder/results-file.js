import { checkResults, isGzip, projectLink, projectResults } from "./results-tools.js";

export async function readText(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (!isGzip(bytes)) return blob.text();
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

export function parseCsv(text) {
  const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(`The CSV could not be read: ${parsed.errors[0].message} (row ${parsed.errors[0].row}).`);
  checkResults(parsed.data);
  return parsed.data;
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
  const rows = parseCsv(await readText(await resultsResponse.blob()));
  const fileName = new URL(project.results).pathname.split("/").pop().replace(/\.gz$/, "").replace(/\.csv$/, "");
  return { name: project.name ?? fileName, fileName, rows };
}
