type UploadResult = {
  success: boolean;
};

type UploadVideo = {
  id?: string;
  filePath?: string;
  title?: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function uploadToYouTube(_video: UploadVideo): Promise<UploadResult> {
  console.log("[UPLOAD][YOUTUBE] uploading...");
  await delay(2000);
  console.log("[UPLOAD][YOUTUBE] done");
  return { success: true  };
}
