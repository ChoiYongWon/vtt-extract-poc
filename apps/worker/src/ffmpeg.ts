import ffmpeg from "fluent-ffmpeg";

export async function toMp3(inputPath: string, outputPath: string) {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioFrequency(16000)
      .audioChannels(1)
      .audioBitrate("32k")
      .format("mp3")
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .save(outputPath);
  });
}

export async function extractPCM(inputPath: string, outputPath: string) {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("pcm_f32le")
      .audioFrequency(16000)
      .audioChannels(1)
      .format("f32le")
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .save(outputPath);
  });
}
