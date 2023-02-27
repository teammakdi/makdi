const { Cluster } = require('puppeteer-cluster');
const fetch = require('sync-fetch');
const axios = require('axios');
var { JSDOM } = require('jsdom');
var { Readability } = require('@mozilla/readability');

DEFAULT_CLUSTER_CONFIG = {
  concurrency: Cluster.CONCURRENCY_CONTEXT,
  maxConcurrency: 1,
  puppeteerOptions: {
    executablePath: 'google-chrome-stable', 
    args: ['--no-sandbox']
  }
}

QUEUE_THRESHOLD = 1;
FETCH_URL = 'http://localhost:9999'; 
LOG_URL = 'http://localhost:9999/log'; 

counterQueued = 0;
counterCrawled = 0;

async function scrape({ page, data: url }) {
  counterCrawled++;
  await page.goto(url, {timeout: 30000});
  const bodyHandle =  await page.evaluate(() =>  document.documentElement.outerHTML);
  const pageRequests =  await page.evaluate(() =>  window.performance.getEntries().map((x) => x.name));

  console.log(bodyHandle);
  console.log(pageRequests);

  let doc = new JSDOM(bodyHandle);
  let reader = new Readability(doc.window.document);
  let article = reader.parse();
  console.log(article);
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
 

}

async function fetchURL() {
  return (await fetch(FETCH_URL));
}

(async () => {
  const cluster = await Cluster.launch(DEFAULT_CLUSTER_CONFIG);
  await cluster.task(scrape);
  cluster.on("taskerror", (err, data) => {
    console.log(`  Error crawling ${data}: ${err.message}`);

  });

  while(true) {
    while (cluster.jobQueue.size() < QUEUE_THRESHOLD) {
      let url = (await fetchURL()).json().url;
      cluster.queue(url);
      console.log(url);
      counterQueued++;
    }
    await cluster.idle();
  }
})();