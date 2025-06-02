import db from './config/database.js';

async function seedQuestions() {
  try {
    // Clear existing questions
    await db.none('TRUNCATE TABLE questions RESTART IDENTITY CASCADE');

    const questions = [
      {
        question: "What car company produces the Mustang?",
        options: ["Ford", "Chevrolet", "Dodge", "Toyota"],
        correctAnswer: "Ford",
        category: "Brands",
        difficulty: "Easy"
      },
      {
        question: "Which country is home to the car manufacturer Ferrari?",
        options: ["Germany", "Italy", "France", "Japan"],
        correctAnswer: "Italy",
        category: "Brands",
        difficulty: "Easy"
      },
      {
        question: "What does 'SUV' stand for?",
        options: ["Sport Utility Vehicle", "Super Urban Vehicle", "Standard Utility Van", "Special Utility Vehicle"],
        correctAnswer: "Sport Utility Vehicle",
        category: "Terminology",
        difficulty: "Easy"
      },
      {
        question: "Which car brand has a prancing horse as its logo?",
        options: ["Lamborghini", "Ferrari", "Porsche", "Jaguar"],
        correctAnswer: "Ferrari",
        category: "Brands",
        difficulty: "Easy"
      },
      {
        question: "What is the world's best-selling electric car model?",
        options: ["Tesla Model 3", "Nissan Leaf", "Chevy Bolt", "BMW i3"],
        correctAnswer: "Tesla Model 3",
        category: "Electric Vehicles",
        difficulty: "Medium"
      },
      {
        question: "Which car company makes the Civic?",
        options: ["Honda", "Toyota", "Hyundai", "Mazda"],
        correctAnswer: "Honda",
        category: "Brands",
        difficulty: "Easy"
      },
      {
        question: "What is the luxury division of Toyota?",
        options: ["Lexus", "Infiniti", "Acura", "Genesis"],
        correctAnswer: "Lexus",
        category: "Brands",
        difficulty: "Easy"
      },
      {
        question: "Which German brand is known for the 'M' performance series?",
        options: ["Audi", "BMW", "Mercedes-Benz", "Volkswagen"],
        correctAnswer: "BMW",
        category: "Performance",
        difficulty: "Medium"
      },
      {
        question: "What is the name of Volkswagen's iconic compact car?",
        options: ["Golf", "Polo", "Beetle", "Passat"],
        correctAnswer: "Beetle",
        category: "Models",
        difficulty: "Easy"
      },
      {
        question: "Which car company uses the slogan 'The Ultimate Driving Machine'?",
        options: ["Audi", "Mercedes-Benz", "BMW", "Porsche"],
        correctAnswer: "BMW",
        category: "Brands",
        difficulty: "Easy"
      }
    ];

    // Insert questions
    for (const q of questions) {
      await db.none(
        `INSERT INTO questions (question, options, correct_answer, category, difficulty) 
         VALUES ($1, $2, $3, $4, $5)`,
        [q.question, q.options, q.correctAnswer, q.category, q.difficulty]
      );
    }

    console.log(`Successfully seeded ${questions.length} questions`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding questions:', error);
    process.exit(1);
  }
}

seedQuestions();
