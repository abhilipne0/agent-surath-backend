const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const config = require("../../config");

// Initialize the S3 client
const s3 = new S3Client({
  region: config.s3BucketConfig.region,
  credentials: {
    accessKeyId: config.s3BucketConfig.accessKeyId,
    secretAccessKey: config.s3BucketConfig.secretAccessKey,
  },
});

/**
 * Uploads a file to the specified S3 bucket.
 *
 * @param {Buffer} fileContent - The content of the file to upload.
 * @param {String} fileName - The name of the file.
 * @param {String} mimeType - The MIME type of the file.
 * @returns {Promise<String>} - The URL of the uploaded file.
 */
const uploadFile = async (fileContent, fileName, mimeType) => {
  const params = {
    Bucket: config.s3BucketConfig.bucket,
    Key: fileName,
    Body: fileContent,
    ContentType: mimeType,
  };

  try {
    await s3.send(new PutObjectCommand(params));
    const fileUrl = `https://${config.s3BucketConfig.bucket}.s3.${config.s3BucketConfig.region}.amazonaws.com/${fileName}`;
    return fileUrl;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw new Error("Failed to upload file");
  }
};

module.exports = { uploadFile };
