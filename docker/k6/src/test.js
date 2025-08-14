import http from 'k6/http';
import { sleep } from 'k6';
// import { Options } from 'k6/options';

export const options = {
  vus: 3,
  iterations: 10,
  duration: '3s'
};

// // The default exported function is gonna be picked up by k6 as the entry point for the test script. It will be executed repeatedly in "iterations" for the whole duration of the test.
// export default function () {
//   // Make a GET request to the target URL
//   http.get('https://quickpizza.grafana.com');
//
//   // Sleep for 1 second to simulate real-world usage
//   sleep(1);
// }


// const url = 'http://localhost:4000/parties/MSISDN/1233641534556178';
const url = 'https://quickpizza.grafana.com/api/put';

export default function () {
  // const headers = {
  //   'Content-Type': 'application/json',
  //   Accept: 'application/vnd.interoperability.iso20022.parties+json;version=2.0'
  // };
  // const data = {};
  const headers = { 'Content-Type': 'application/json' };
  const data = { name: 'Bert' };

  const res = http.put(url, JSON.stringify(data), { headers });

  let body = {};
  try {
    body = JSON.parse(res.body)
  } catch {}

  console.log(body);

  sleep(0.5)
}
