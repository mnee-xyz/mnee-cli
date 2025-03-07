import crypto from "crypto";
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16; // AES IV length
export const encryptPrivateKey = (privateKey, password) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.createHash("sha256").update(password).digest();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(privateKey, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}:${encrypted}`;
};
export const decryptPrivateKey = (encryptedData, password) => {
    try {
        const [ivHex, encryptedKey] = encryptedData.split(":");
        const iv = Buffer.from(ivHex, "hex");
        const key = crypto.createHash("sha256").update(password).digest();
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encryptedKey, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    }
    catch (error) {
        return null;
    }
};
