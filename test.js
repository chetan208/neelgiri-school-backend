import http from 'k6/http';
import { sleep, check } from 'k6';

// Define the stages for the load test to evaluate concurrency
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp-up: 0 to 50 virtual users (VUs) in 30 seconds
    { duration: '1m', target: 50 },    // Load test: Stay at 50 VUs for 1 minute
    { duration: '30s', target: 100 },  // Ramp-up: 50 to 100 VUs in 30 seconds
    { duration: '1m', target: 100 },   // Stress test: Stay at 100 VUs for 1 minute
    { duration: '30s', target: 200 },  // Ramp-up: 100 to 200 VUs in 30 seconds (Scale limit)
    { duration: '1m', target: 200 },   // Peak load: Stay at 200 VUs for 1 minute
    { duration: '30s', target: 0 },    // Ramp-down: 200 to 0 VUs in 30 seconds
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],    // Error rate must be less than 2%
    http_req_duration: ['p(95)<800'],  // 95% of requests must complete within 800ms
  },
};

const BASE_URL = 'https://api.neelgiripublicschool.in';

export default function () {
  // Scenario 1: Fetching school stats on home page
  const statsRes = http.get(`${BASE_URL}/api/school-stats`);
  check(statsRes, {
    'school stats returns 200': (r) => r.status === 200,
  });

  // Scenario 2: Fetching school board notices
  const noticesRes = http.get(`${BASE_URL}/api/notices`);
  check(noticesRes, {
    'notices returns 200': (r) => r.status === 200,
  });

  // Scenario 3: Fetching paginated media items (Memories grid)
  const mediaRes = http.get(`${BASE_URL}/api/media?page=1`);
  check(mediaRes, {
    'media preview returns 200': (r) => r.status === 200,
  });

  sleep(1);

  // Scenario 4: Requesting previous question papers for 10th standard
  const pyqsRes = http.get(`${BASE_URL}/api/pyqs/10th`);
  check(pyqsRes, {
    'pyqs returns 200': (r) => r.status === 200,
  });

  sleep(1);

  // Scenario 5: Checking if school admissions window is active
  const admissionYearRes = http.get(`${BASE_URL}/api/admissions/active-admission-year`);
  check(admissionYearRes, {
    'admission year returns 200': (r) => r.status === 200,
  });

  sleep(1);

  // Scenario 6: Contact Us form submission simulation (Simulating 10% of users submitting)
  if (Math.random() < 0.10) {
    const contactPayload = JSON.stringify({
      name: `VU-${__VU} LoadTest`,
      email: `vu-${__VU}-test@example.com`,
      phoneNumber: '9876543210',
      message: 'This is an automated performance load testing enquiry sent via k6 testing engine.',
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const contactRes = http.post(`${BASE_URL}/api/contact`, contactPayload, params);
    check(contactRes, {
      'contact submission returns 200 or 201': (r) => r.status === 200 || r.status === 201,
    });
  }

  sleep(1);
}