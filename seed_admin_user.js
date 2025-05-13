import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";

const db = new sqlite3.Database("quiz.db");

const email = "admin@admin.com";
const password = "admin123";
const isAdmin = 1;

const hashPassword = async (plain) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(plain, salt);
};

(async () => {
  const hashed = await hashPassword(password);
  db.run(
    `INSERT OR IGNORE INTO users (email, password, is_admin) VALUES (?, ?, ?)`,
    [email, hashed, isAdmin],
    function (err) {
      if (err) {
        console.error("Failed to insert admin user:", err.message);
      } else {
        console.log("Test admin user added:", email);
      }
      db.close();
    }
  );
})();
