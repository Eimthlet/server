import sqlite3 from "sqlite3";

const db = new sqlite3.Database("quiz.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    optionA TEXT NOT NULL,
    optionB TEXT NOT NULL,
    optionC TEXT NOT NULL,
    optionD TEXT NOT NULL,
    answer TEXT NOT NULL
  )`);

  db.run("DELETE FROM questions"); // Clear previous data

  const stmt = db.prepare("INSERT INTO questions (question, optionA, optionB, optionC, optionD, answer) VALUES (?, ?, ?, ?, ?, ?)");

  const questions = [
    ["What car company produces the Mustang?", "Ford", "Chevrolet", "Dodge", "Toyota", "Ford"],
    ["Which country is home to the car manufacturer Ferrari?", "Germany", "Italy", "France", "Japan", "Italy"],
    ["What does 'SUV' stand for?", "Sport Utility Vehicle", "Super Urban Vehicle", "Standard Utility Van", "Special Utility Vehicle", "Sport Utility Vehicle"],
    ["Which car brand has a prancing horse as its logo?", "Lamborghini", "Ferrari", "Porsche", "Jaguar", "Ferrari"],
    ["What is the world's best-selling electric car model?", "Tesla Model 3", "Nissan Leaf", "Chevy Bolt", "BMW i3", "Tesla Model 3"],
    ["Which car company makes the Civic?", "Honda", "Toyota", "Hyundai", "Mazda", "Honda"],
    ["What is the luxury division of Toyota?", "Lexus", "Infiniti", "Acura", "Genesis", "Lexus"],
    ["Which German brand is known for the 'M' performance series?", "Audi", "BMW", "Mercedes-Benz", "Volkswagen", "BMW"],
    ["What is the name of Volkswagen's iconic compact car?", "Golf", "Polo", "Beetle", "Passat", "Beetle"],
    ["Which car company uses the slogan 'The Ultimate Driving Machine'?", "Audi", "Mercedes-Benz", "BMW", "Porsche", "BMW"],
    ["Which car is often called the 'Godzilla' in the car community?", "Nissan GT-R", "Toyota Supra", "Mazda RX-7", "Subaru WRX", "Nissan GT-R"],
    ["Which automaker produces the Camry?", "Toyota", "Honda", "Nissan", "Kia", "Toyota"],
    ["What country is Volvo from?", "Germany", "Sweden", "Norway", "Denmark", "Sweden"],
    ["Which car brand's logo features four interlocked rings?", "Audi", "Subaru", "Volkswagen", "Opel", "Audi"],
    ["Which Japanese car brand makes the Impreza?", "Toyota", "Honda", "Subaru", "Mazda", "Subaru"],
    ["What does 'GT' stand for in car models?", "Grand Touring", "Great Traction", "Gas Turbo", "General Transport", "Grand Touring"],
    ["Which Italian brand is famous for the Countach?", "Ferrari", "Lamborghini", "Maserati", "Alfa Romeo", "Lamborghini"],
    ["Which car company produces the F-150 truck?", "Chevrolet", "Ford", "Ram", "Toyota", "Ford"],
    ["What is the main luxury brand of Honda?", "Lexus", "Acura", "Infiniti", "Genesis", "Acura"],
    ["Which French carmaker is known for the 2CV?", "Peugeot", "Citroën", "Renault", "Bugatti", "Citroën"]
  ];

  for (const q of questions) {
    stmt.run(q);
  }
  stmt.finalize();
});

db.close();
console.log("Database seeded with 20 questions.");
