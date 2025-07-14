import fetch from 'node-fetch';
import FormData from 'form-data';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Uploads an image to the custom CDN.
 * @param {Buffer} imageBuffer - The image data as a buffer.
 * @param {string} filename - The desired filename for the image.
 * @returns {Promise<string>} The URL of the uploaded image.
 * @throws {Error} If the upload fails.
 */
async function uploadImageToCdn(imageBuffer, filename) {
  const form = new FormData();
  form.append('image', imageBuffer, { filename });

  const response = await fetch(config.cdn.baseUrl, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({
      message: 'Failed to upload image to CDN',
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      filename,
    });
    throw new Error(`Failed to upload image to CDN: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.url) {
    throw new Error('CDN response did not include a URL.');
  }

  return result.url;
}

export default {
  uploadImageToCdn,
};
