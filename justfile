# List available recipes
default:
    @just --list

# Install the documentation dependencies
setup:
    uv sync --only-group docs

# Run the helper tests
test:
    node --test

# Serve the documentation with live reload
run:
    uv run --only-group docs zensical serve

# Build the documentation into site/
build:
    uv run --only-group docs zensical build --clean
