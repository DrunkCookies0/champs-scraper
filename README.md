# champs-scraper

Browser-based app to scrape league data from an admin dashboard page.

## Run

Open `index.html` in a browser.

## How to use

1. Log into your former league admin dashboard in that same browser.
2. In the app, either:
   - enter the dashboard URL and click **Scrape URL**, or
   - upload an exported HTML file, or
   - paste dashboard HTML directly.
3. Review the extracted JSON and click **Download JSON**.

## Extracted data

The scraper collects:
- page title and scrape timestamp
- headings/sections
- all tables (headers + rows)
- list items (`ul` / `ol`)
- detected key/value pairs from common row patterns
