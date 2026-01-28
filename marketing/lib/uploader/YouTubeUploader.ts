import { spawn } from "node:child_process";

export type UploadResult = {
  success: boolean;
  message?: string;
};

const runPythonUploadOnce = () =>
  new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
    const child = spawn("python", ["youtube_upload_once.py"], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });

const extractErrorMessage = (stdout: string) => {
  const line = stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.startsWith("ERROR_MESSAGE="));
  return line ? line.replace("ERROR_MESSAGE=", "").trim() : "";
};

export class YouTubeUploader {
  async upload(_filePath: string): Promise<UploadResult> {
    try {
      const { stdout, stderr, code } = await runPythonUploadOnce();
      if (stderr) {
        console.error(`[UPLOAD][YOUTUBE][STDERR] ${stderr}`);
      }
      const success = stdout.includes("UPLOAD_RESULT=SUCCESS");
      if (success) {
        return { success: true };
      }
      const errorMessage = extractErrorMessage(stdout);
      return {
        success: false,
        message: errorMessage || `python exited with code ${code ?? "unknown"}`
      };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }
}
