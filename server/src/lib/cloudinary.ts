import { v2 as cloudinary } from "cloudinary";
import { env } from "../env.js";

// Configure Cloudinary
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/**
 * Upload result from Cloudinary
 */
export interface UploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
}

/**
 * Upload a PNG buffer to Cloudinary
 * @param buffer - PNG image buffer
 * @param publicId - Optional public ID for the image (will be auto-generated if not provided)
 * @returns Upload result with URLs
 */
export async function uploadImage(
  buffer: Buffer,
  publicId?: string
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const uploadOptions: Record<string, unknown> = {
      folder: "gradient-tweets",
      resource_type: "image",
      format: "png",
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    // Upload using upload_stream for buffer data
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
          return;
        }

        if (!result) {
          reject(new Error("Cloudinary upload returned no result"));
          return;
        }

        resolve({
          url: result.url,
          secureUrl: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      }
    );

    // Write the buffer to the upload stream
    uploadStream.end(buffer);
  });
}

/**
 * Delete an image from Cloudinary
 * @param publicId - The public ID of the image to delete
 */
export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
