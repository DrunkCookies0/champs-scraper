const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const urlEl = document.getElementById("dashboard-url");
const htmlEl = document.getElementById("dashboard-html");
const fileEl = document.getElementById("dashboard-file");
const downloadBtn = document.getElementById("download-json");

let latestResult = null;
const TRUSTED_LEAGUE_HOSTS = new Set(["champs.leagueos.gg"]);

const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();

function removeTagBlockContents(html, tagName) {
  const lowerHtml = html.toLowerCase();
  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}`;
  let cursor = 0;
  let output = "";

  while (cursor < html.length) {
    const openIndex = lowerHtml.indexOf(openTag, cursor);
    if (openIndex === -1) {
      output += html.slice(cursor);
      break;
    }

    output += html.slice(cursor, openIndex);
    const openEnd = lowerHtml.indexOf(">", openIndex);
    if (openEnd === -1) {
      break;
    }

    const closeIndex = lowerHtml.indexOf(closeTag, openEnd + 1);
    if (closeIndex === -1) {
      cursor = openEnd + 1;
      continue;
    }

    const closeEnd = lowerHtml.indexOf(">", closeIndex);
    if (closeEnd === -1) {
      cursor = html.length;
      break;
    }

    cursor = closeEnd + 1;
  }

  return output;
}

function stripTags(html) {
  const withoutScript = removeTagBlockContents(html, "script");
  const withoutScriptAndStyle = removeTagBlockContents(withoutScript, "style");
  return normalizeWhitespace(withoutScriptAndStyle.replace(/<[^>]*>/g, " "));
}

function extractMatches(pattern, html) {
  return Array.from(html.matchAll(pattern));
}

function extractTables(html) {
  return extractMatches(/<table[\s\S]*?<\/table>/gi, html).map((tableMatch, index) => {
    const tableHtml = tableMatch[0];
    const caption = stripTags((tableHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i) || [])[1] || "");
    const headers = extractMatches(/<th[^>]*>([\s\S]*?)<\/th>/gi, tableHtml).map((match) => stripTags(match[1]));
    const rows = extractMatches(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, tableHtml)
      .map((rowMatch) => extractMatches(/<td[^>]*>([\s\S]*?)<\/td>/gi, rowMatch[1]).map((cell) => stripTags(cell[1])))
      .filter((cells) => cells.length > 0);

    return {
      tableIndex: index,
      caption,
      headers,
      rows,
    };
  });
}

function extractLists(html) {
  return extractMatches(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, html).map((listMatch, index) => ({
    listIndex: index,
    type: listMatch[1].toLowerCase(),
    items: extractMatches(/<li[^>]*>([\s\S]*?)<\/li>/gi, listMatch[2]).map((item) => stripTags(item[1])),
  }));
}

function extractKeyValuePairs(html) {
  const fromRows = extractMatches(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, html)
    .map((rowMatch) =>
      extractMatches(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi, rowMatch[1]).map((cell) => stripTags(cell[1])),
    )
    .filter((cells) => cells.length === 2 && cells[0] && cells[1])
    .map((cells) => ({ key: cells[0], value: cells[1] }));

  const dtMatches = extractMatches(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi, html)
    .map((match) => ({ key: stripTags(match[1]), value: stripTags(match[2]) }))
    .filter((pair) => pair.key && pair.value);

  return [...fromRows, ...dtMatches];
}

function extractSections(html) {
  return extractMatches(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi, html).map((headingMatch, index, allMatches) => {
    const heading = stripTags(headingMatch[2]);
    const start = headingMatch.index + headingMatch[0].length;
    const nextStart = index < allMatches.length - 1 ? allMatches[index + 1].index : html.length;
    const sectionBody = html.slice(start, nextStart);
    const content = [stripTags(sectionBody)].filter(Boolean);

    return { heading, content };
  });
}

function scrapeLeagueDataFromHtml(html) {
  const doc = html;
  const pageTitle = stripTags((doc.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  return {
    scrapedAt: new Date().toISOString(),
    pageTitle,
    sections: extractSections(doc),
    tables: extractTables(doc),
    lists: extractLists(doc),
    keyValuePairs: extractKeyValuePairs(doc),
  };
}

function requestOptionsForUrl(url) {
  const appOrigin = window.location.origin;
  const isSameOrigin = appOrigin !== "null" && url.origin === appOrigin;
  return isSameOrigin || TRUSTED_LEAGUE_HOSTS.has(url.hostname) ? { credentials: "include" } : {};
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
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      updateStatus("Only http:// and https:// URLs are supported.", true);
      return;
    }
    const response = await fetch(parsedUrl, requestOptionsForUrl(parsedUrl));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
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
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `league-data-${date}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

document.getElementById("scrape-url").addEventListener("click", scrapeFromUrl);
document.getElementById("scrape-html").addEventListener("click", scrapeFromFileOrPaste);
downloadBtn.addEventListener("click", downloadLatestJson);
