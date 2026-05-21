import unittest

from fastapi.testclient import TestClient

from src.web_app import app


class WebAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_endpoint(self):
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_frontend_is_served(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/html', response.headers.get('content-type', ''))
        self.assertIn('Car Picker', response.text)

    def test_recommendations_endpoint_returns_markdown_and_cars(self):
        response = self.client.post(
            '/api/recommendations',
            json={
                'purpose': 'commute',
                'budget': 15000,
                'is_first_car': False,
                'years_to_keep': 5,
                'top_n': 3,
            },
        )
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertIn('markdown', body)
        self.assertIn('top_cars', body)
        self.assertIn('Top Car Recommendations', body['markdown'])
        self.assertTrue(body['top_cars'])


if __name__ == '__main__':
    unittest.main()
