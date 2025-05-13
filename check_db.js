const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'quiz.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Database opened successfully');

  // Check table schema
  db.all("PRAGMA table_info(questions)", (err, tableInfo) => {
    if (err) {
      console.error('Error checking table schema:', err);
      return;
    }
    console.log('Questions table schema:', tableInfo);

    // Fetch questions
    db.all("SELECT * FROM questions LIMIT 5", (err, rows) => {
      if (err) {
        console.error('Error fetching questions:', err);
        return;
      }
      console.log('Questions:', rows);
      db.close();
    });
  });
});
