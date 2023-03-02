const { Cluster } = require('puppeteer-cluster');
const fetch = require('sync-fetch');
const axios = require('axios');
const express = require('express')
var { JSDOM } = require('jsdom');
var { Readability } = require('@mozilla/readability');
const { env } = require('process');
const path = require('path');

const APP_VERSION = require('child_process')
.execSync('git rev-parse --short HEAD')
.toString().trim();
const APP_PROVIDER = env.APP_PROVIDER ?? 'none'
const APP_ID = APP_PROVIDER + ":" + Math.random().toString(36).slice(2);

const app = express()

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = 8080;

DEFAULT_CLUSTER_CONFIG = {
  concurrency: Cluster.CONCURRENCY_CONTEXT,
  maxConcurrency: 4,
  puppeteerOptions: {
    executablePath: 'google-chrome-stable', 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=egl'],
    ignoreDefaultArgs: ['--disable-extensions'],
  }
}

QUEUE_THRESHOLD = 30;
FETCH_URL = 'https://makdi-admin.netlify.app/.netlify/functions/main/urls?app_id=' + APP_ID; 
LOG_URL = 'https://makdi-log.netlify.app/.netlify/functions/main/log?app_id=' + APP_ID;
startTime = Date.now(); 

counterQueued = 0;
counterStarted = 0;
counterSuccess = 0;
counterFailed = 0;

async function scrape({ page, data: url }) {
  counterStarted++;
  console.log(startTime, counterQueued, counterStarted, counterSuccess, counterFailed);
  await page.goto(url, {timeout: 30000});
  const bodyHandle =  await page.evaluate(() =>  document.documentElement.outerHTML);
  const pageRequests =  await page.evaluate(() =>  window.performance.getEntries().map((x) => x.name));

  let doc = new JSDOM(bodyHandle);
  let reader = new Readability(doc.window.document);
  let article = reader.parse();
  counterSuccess++;
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
    appID: APP_ID
  },
  {'Accept' : 'application/json'})
  .then((response) => {  
  })
  .catch((e) => {
    console.error("Error while logging url: ", url)
  })
  console.log("Crawled: ", url);
}

async function fetchURL() {
  return (await fetch(FETCH_URL));
}

(async () => {
  const cluster = await Cluster.launch(DEFAULT_CLUSTER_CONFIG);
  await cluster.task(scrape);
  startTime = Date.now();
  cluster.on("taskerror", (err, data) => {
    console.error(`Error crawling ${data}: ${err.message}`);
    counterFailed++;
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

app.get('/', (req, res, next) => {
  res.status(200).render('index', { APP_ID: APP_ID, APP_VERSION: APP_VERSION});
});

app.get('*', (req, res, next) => {
	res.status(404).send('Sorry, page not found!');
	next();
});

app.listen(port, () => {
  console.log(`Makdi listening on port ${port}`)
})
