const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const urlEl = document.getElementById("dashboard-url");
const htmlEl = document.getElementById("dashboard-html");
const fileEl = document.getElementById("dashboard-file");
const downloadBtn = document.getElementById("download-json");

let latestResult = null;

const getText = (value) => value.replace(/\s+/g, " ").trim();

function parseHtmlString(html) {
  const sanitizedHtml = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
  const parser = new DOMParser();
  return parser.parseFromString(sanitizedHtml, "text/html");
}

function extractTables(doc) {
  return Array.from(doc.querySelectorAll("table")).map((table, index) => {
    const headers = Array.from(table.querySelectorAll("thead th, tr th")).map((th) => getText(th.textContent || ""));
    const rows = Array.from(table.querySelectorAll("tbody tr, tr"))
      .map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => getText(td.textContent || "")))
      .filter((cells) => cells.length > 0);

    return {
      tableIndex: index,
      caption: getText(table.querySelector("caption")?.textContent || ""),
      headers,
      rows,
    };
  });
}

function extractLists(doc) {
  return Array.from(doc.querySelectorAll("ul, ol")).map((list, index) => ({
    listIndex: index,
    type: list.tagName.toLowerCase(),
    items: Array.from(list.querySelectorAll(":scope > li")).map((li) => getText(li.textContent || "")),
  }));
}

function extractKeyValuePairs(doc) {
  const pairs = [];

  for (const row of doc.querySelectorAll("tr")) {
    const cells = Array.from(row.querySelectorAll("th, td")).map((cell) => getText(cell.textContent || ""));
    if (cells.length === 2 && cells[0] && cells[1]) {
      pairs.push({ key: cells[0], value: cells[1] });
    }
  }

  for (const item of doc.querySelectorAll("dt")) {
    const value = item.nextElementSibling?.tagName.toLowerCase() === "dd" ? getText(item.nextElementSibling.textContent || "") : "";
    const key = getText(item.textContent || "");
    if (key && value) {
      pairs.push({ key, value });
    }
  }

  return pairs;
}

function extractSections(doc) {
  return Array.from(doc.querySelectorAll("h1, h2, h3")).map((heading) => {
    const sectionTexts = [];
    let cursor = heading.nextElementSibling;

    while (cursor && !/^H[1-3]$/.test(cursor.tagName)) {
      const text = getText(cursor.textContent || "");
      if (text) {
        sectionTexts.push(text);
      }
      cursor = cursor.nextElementSibling;
    }

    return {
      heading: getText(heading.textContent || ""),
      content: sectionTexts,
    };
  });
}

function scrapeLeagueDataFromHtml(html) {
  const doc = parseHtmlString(html);
  return {
    scrapedAt: new Date().toISOString(),
    pageTitle: getText(doc.title || ""),
    url: doc.URL,
    sections: extractSections(doc),
    tables: extractTables(doc),
    lists: extractLists(doc),
    keyValuePairs: extractKeyValuePairs(doc),
  };
}

function updateResult(data) {
  latestResult = data;
  resultEl.value = JSON.stringify(data, null, 2);
  downloadBtn.disabled = false;
}

function updateStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#fca5a5" : "#86efac";
}

async function scrapeFromUrl() {
  const url = urlEl.value.trim();
  if (!url) {
    updateStatus("Provide a dashboard URL first.", true);
    return;
  }

  updateStatus("Fetching dashboard HTML...");

  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    updateResult(scrapeLeagueDataFromHtml(html));
    updateStatus("Dashboard data scraped from URL.");
  } catch (error) {
    updateStatus(
      "Could not scrape URL directly (likely CORS/auth restrictions). Try uploading or pasting dashboard HTML.",
      true,
    );
    console.error(error);
  }
}

async function scrapeFromFileOrPaste() {
  let html = htmlEl.value.trim();

  if (!html && fileEl.files?.[0]) {
    html = await fileEl.files[0].text();
  }

  if (!html) {
    updateStatus("Paste HTML or choose an HTML file first.", true);
    return;
  }

  try {
    updateResult(scrapeLeagueDataFromHtml(html));
    updateStatus("Dashboard data scraped from HTML input.");
  } catch (error) {
    updateStatus("Could not parse the supplied HTML.", true);
    console.error(error);
  }
}

function downloadLatestJson() {
  if (!latestResult) return;

  const blob = new Blob([JSON.stringify(latestResult, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "league-data.json";
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById("scrape-url").addEventListener("click", scrapeFromUrl);
document.getElementById("scrape-html").addEventListener("click", scrapeFromFileOrPaste);
downloadBtn.addEventListener("click", downloadLatestJson);
