"""Make a Kelivo-format provider QR (ai-provider:v1: + base64 JSON) for App Review.

The key is read from the environment so it never lands in git or shell history.
Write the PNG OUTSIDE the repository: the image contains the key.

  PowerShell:  $env:QR_API_KEY = '<limited test key>'
               python scripts/make-provider-qr.py C:\\Users\\farij\\notes\\review-qr.png
  Optional env: QR_TYPE (openai|claude|google, default openai), QR_NAME, QR_BASE_URL
"""
import base64, json, os, sys
import qrcode

out = sys.argv[1] if len(sys.argv) > 1 else 'review-qr.png'
key = os.environ.get('QR_API_KEY')
if not key:
    sys.exit('set QR_API_KEY first')
payload = {'type': os.environ.get('QR_TYPE', 'openai'), 'name': os.environ.get('QR_NAME', 'OpenAI'), 'apiKey': key}
if os.environ.get('QR_BASE_URL'):
    payload['baseUrl'] = os.environ['QR_BASE_URL']
text = 'ai-provider:v1:' + base64.b64encode(json.dumps(payload, separators=(',', ':')).encode()).decode()
qrcode.make(text, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4).save(out)
print('wrote', out, '(contains the key: keep it out of git)')
