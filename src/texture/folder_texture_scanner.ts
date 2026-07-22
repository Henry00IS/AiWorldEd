import { isImageFileName } from './image_file_filter.js';
import {
  PickedDirectoryFile,
  PickedDirectoryListing
} from './local_directory_access.js';
import {
  TextureBrowserEntry,
  createTextureBrowserEntry
} from './texture_browser_entry.js';

/**
 * Result of scanning a picked directory for image textures.
 */
export interface FolderTextureScanResult {
  folderName: string;
  entries: TextureBrowserEntry[];
  skippedNonImageCount: number;
}

/**
 * Filters directory files to image textures and builds browser entries.
 */
export class FolderTextureScanner {
  /**
   * Scans a directory listing and creates texture browser entries.
   * @param listing Files from LocalDirectoryAccess.
   * @returns Scan result with image entries only.
   */
  scanListing(listing: PickedDirectoryListing): FolderTextureScanResult {
    const imageFiles = listing.files.filter((entry) =>
      isImageFileName(entry.name)
    );
    const entries = imageFiles.map((entry) =>
      this.createEntryFromPickedFile(entry)
    );
    entries.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, {
        sensitivity: 'base'
      })
    );
    return {
      folderName: listing.folderName,
      entries,
      skippedNonImageCount: listing.files.length - imageFiles.length
    };
  }

  /**
   * Builds one browser entry from a picked file record.
   * @param picked File from the directory walk.
   * @returns Texture browser entry.
   */
  private createEntryFromPickedFile(
    picked: PickedDirectoryFile
  ): TextureBrowserEntry {
    return createTextureBrowserEntry(picked.file, picked.relativePath);
  }
}
