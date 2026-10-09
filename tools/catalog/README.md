# Device catalogue tooling

Regenerates `app/src/devices/catalog.json` from the official VTER / driveall.cn web driver.
The vendor bundle is not stored in this repo; the steps download it.

```bash
cd tools/catalog
# 1. fetch and beautify the driver bundle (check the hash in https://vter.driveall.cn/ index.html)
curl -sL https://vter.driveall.cn/static/js/app.<hash>.js -o app.js
npx js-beautify@1.15.1 app.js -o app.pretty.js
curl -sL https://vter.driveall.cn/static/css/app.<hash>.css -o app.css
# 2. device list, USB filters and raw layouts -> devices-raw.json
node extract-devices.js
# 3. measure key geometry with the driver's own CSS: serve this folder, open measure.html in a
#    Chromium browser, then run in its console:  fetch('/save', {method:'POST', body: JSON.stringify(__result)})
node serve.js            # http://localhost:5199/measure.html -> writes measured.json
# 4. build the catalogue
node build-catalog.js ../../app/src/devices/catalog.json
```

`extract-devices.js` evaluates the driver's device table (`Y`) and USB filter table (`T`) with the
layout getters it references; `measure.html` renders every layout with the official stylesheet and
records each key's position in key units. The Fighting68 entry is then pointed at FCC's hand-tuned
layout and marked verified.
