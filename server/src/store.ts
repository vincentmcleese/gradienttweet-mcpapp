import { nanoid } from "nanoid";

/**
 * Share metadata stored for each generated image
 */
export interface ShareMetadata {
  id: string;
  cloudinaryUrl: string;
  handle: string;
  avatarUrl: string;
  text: string;
  hue: number;
  createdAt: Date;
}

/**
 * Simple in-memory store for share metadata
 * In production, this could be replaced with a database
 */
class ShareStore {
  private shares: Map<string, ShareMetadata> = new Map();

  /**
   * Create a new share entry
   */
  create(data: Omit<ShareMetadata, "id" | "createdAt">): ShareMetadata {
    const id = nanoid(10);
    const metadata: ShareMetadata = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.shares.set(id, metadata);
    return metadata;
  }

  /**
   * Get a share by ID
   */
  get(id: string): ShareMetadata | undefined {
    return this.shares.get(id);
  }

  /**
   * Delete a share by ID
   */
  delete(id: string): boolean {
    return this.shares.delete(id);
  }

  /**
   * Get all shares (for debugging)
   */
  getAll(): ShareMetadata[] {
    return Array.from(this.shares.values());
  }
}

// Export singleton instance
export const shareStore = new ShareStore();
