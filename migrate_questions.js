import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';

async function migrateQuestions() {
  try {
    // Open the database
    const db = await open({
      filename: './quiz.db',
      driver: sqlite3.Database
    });

    // Create questions table if not exists
    await db.exec(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        correctAnswer TEXT NOT NULL,
        category TEXT,
        difficulty TEXT
      )
    `);

    // Read questions from JSON file
    const questionsPath = path.join(process.cwd(), 'questions.json');
    const questionsData = await fs.readFile(questionsPath, 'utf8');
    const questions = JSON.parse(questionsData);

    // Insert questions
    for (const q of questions) {
      const options = JSON.stringify([q.optionA, q.optionB, q.optionC, q.optionD]);
      
      await db.run(
        `INSERT INTO questions (question, options, correctAnswer, category, difficulty) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          q.question, 
          options, 
          q.answer, 
          'General', // Default category
          'Medium'   // Default difficulty
        ]
      );
    }

    console.log(`Migrated ${questions.length} questions successfully`);
    await db.close();
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrateQuestions();
