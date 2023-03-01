const { Cluster } = require('puppeteer-cluster');
const fetch = require('sync-fetch');
const axios = require('axios');
const express = require('express')
const app = express()
var { JSDOM } = require('jsdom');
var { Readability } = require('@mozilla/readability');
const { env } = require('process');

const APP_ID = Math.random().toString(36).slice(2);

const port = 8080;

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
FETCH_URL = 'https://makdi-admin.netlify.app/.netlify/functions/main/urls?app_id=' + APP_ID; 
LOG_URL = 'https://makdi-log.netlify.app/.netlify/functions/main/log?app_id=' + APP_ID;

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
    data: {
      requests : JSON.stringify(pageRequests),
      article: {
        content : article.content,
        title: article.title,
        textContent: article.textContent,
        siteName: article.siteName
      },
      url: url
    },
    appProvider: env.APP_PROVIDER ?? 'None',
    appID: APP_ID
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

app.use('/', (req, res, next) => {
  res.render('index.pug', { APP_ID: APP_ID });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
