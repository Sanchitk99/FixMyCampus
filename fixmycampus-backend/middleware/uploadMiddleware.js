import multer from "multer";

const memory = multer.memoryStorage();

export const uploadMemory = multer({
  storage: memory,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
});
