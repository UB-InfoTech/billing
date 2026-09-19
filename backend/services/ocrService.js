const AWS = require('aws-sdk');
const { VisionClient } = require('@google-cloud/vision'); // Install @google-cloud/vision

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// const visionClient = new VisionClient({
//   keyFilename: process.env.GOOGLE_VISION_API_KEY,
// });

exports.uploadToS3 = async (file) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `receipts/${Date.now()}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  const { Location } = await s3.upload(params).promise();

  // OCR Extraction
  const [result] = await visionClient.textDetection(file.path);
  const text = result.textAnnotations[0]?.description || '';
  const extractedData = {
    amount: parseFloat(text.match(/\d+\.?\d*/)?.[0]) || 0,
    vendor: text.match(/^[A-Za-z\s]+/)?.[0] || 'Unknown',
    date: text.match(/\d{2}[-/]\d{2}[-/]\d{4}/)?.[0] || new Date(),
  };

  return { url: Location, extractedData };
};