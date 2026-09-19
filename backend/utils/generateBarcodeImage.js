const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');

const generateBarcodeImage = async (text) => {
  const buffer = await bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center'
  });

  const filename = `barcode-${text}.png`;
  const filepath = path.join(__dirname, `../barcodes/${filename}`);
  fs.writeFileSync(filepath, buffer);
  return `/barcodes/${filename}`; // Or upload to Cloudinary
};

module.exports = generateBarcodeImage;
