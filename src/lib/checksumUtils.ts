/**
 * Calculate SHA-256 checksum for a file
 * @param file - The file to calculate checksum for
 * @returns Promise with the checksum as a hex string
 */
export async function calculateFileChecksum(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Validate a file against its stored checksum
 * @param file - The file to validate
 * @param expectedChecksum - The expected checksum
 * @returns Promise with boolean indicating if checksums match
 */
export async function validateFileChecksum(file: File, expectedChecksum: string): Promise<boolean> {
  const actualChecksum = await calculateFileChecksum(file);
  return actualChecksum === expectedChecksum;
}
