const { Cluster } = require('puppeteer-cluster');
const fetch = require('sync-fetch');
const axios = require('axios');
const http = require('http');
const fs = require('fs');
var { JSDOM } = require('jsdom');
var { Readability } = require('@mozilla/readability');

const port = 8080;

const httpServer = http.createServer(httpHandler);

DEFAULT_CLUSTER_CONFIG = {
  concurrency: Cluster.CONCURRENCY_CONTEXT,
  maxConcurrency: 1,
  puppeteerOptions: {
    executablePath: 'google-chrome-stable', 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=egl'],
    ignoreDefaultArgs: ['--disable-extensions'],
  }
}

QUEUE_THRESHOLD = 2;
FETCH_URL = 'https://makdi-admin.netlify.app/.netlify/functions/main/urls'; 
LOG_URL = 'https://makdi-log.netlify.app/.netlify/functions/main/log'; 

counterQueued = 0;
counterCrawled = 0;

async function scrape({ page, data: url }) {
  counterCrawled++;
  await page.goto(url, {timeout: 30000});
  const bodyHandle =  await page.evaluate(() =>  document.documentElement.outerHTML);
  const pageRequests =  await page.evaluate(() =>  window.performance.getEntries().map((x) => x.name));

  let doc = new JSDOM(bodyHandle);
  let reader = new Readability(doc.window.document);
  let article = reader.parse();
  axios.post(LOG_URL, {
    requests : JSON.stringify(pageRequests),
    article: {
      content : article.content,
      title: article.title,
      textContent: article.textContent,
      siteName: article.siteName
    },
    url: url
  },
  {'Accept' : 'application/json'})
  .then((response) => {  
  })
  .catch((e) => {
    console.error(e)
  })
  console.log("Crawled: ", url);
}

async function fetchURL() {
  return (await fetch(FETCH_URL));
}

(async () => {
  const cluster = await Cluster.launch(DEFAULT_CLUSTER_CONFIG);
  await cluster.task(scrape);
  cluster.on("taskerror", (err, data) => {
    console.error(`Error crawling ${data}: ${err.message}`);
  });

  while(true) {
    while (cluster.jobQueue.size() < QUEUE_THRESHOLD) {
      let url = (await fetchURL()).json().url;
      cluster.queue(url);
      counterQueued++;
    }
    await cluster.idle();
  }
})();

function httpHandler(req, res) {
  fs.readFile('./public/' + req.url, function (err, data) {
      if (err == null) {
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.write(data);
          res.end();
      }
  });
}

httpServer.listen(port, () => {
  console.log(`HTTP server running at ${port}`);
});
