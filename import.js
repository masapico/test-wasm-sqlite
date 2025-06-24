// import.js
// This script reads `utf_ken_all.csv` and converts it into an SQLite database `zipcode.db`.

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { parse } = require("csv-parse");

// --- Configuration ---
const csvFilePath = path.join(__dirname, "data", "utf_ken_all.csv");
const dbDirPath = path.join(__dirname, "data");
const dbFilePath = path.join(dbDirPath, "zipcode.db");

// --- Main function ---
async function main() {
  console.log("Starting the import process...");

  // Ensure the data directory exists
  if (!fs.existsSync(dbDirPath)) {
    fs.mkdirSync(dbDirPath, { recursive: true });
    console.log(`Created directory: ${dbDirPath}`);
  }

  // Check if the CSV file exists
  if (!fs.existsSync(csvFilePath)) {
    console.error(`Error: CSV file not found at ${csvFilePath}`);
    console.error(
      "Please download `utf_ken_all.csv` from the Japan Post website and place it in the `data` directory."
    );
    return;
  }

  // Remove existing database file to start fresh
  if (fs.existsSync(dbFilePath)) {
    fs.unlinkSync(dbFilePath);
    console.log(`Removed existing database file: ${dbFilePath}`);
  }

  // Initialize SQLite database
  const db = new sqlite3.Database(dbFilePath, (err) => {
    if (err) {
      console.error("Error opening database:", err.message);
      return;
    }
    console.log(`Successfully connected to database: ${dbFilePath}`);
  });

  // Create table and index
  db.serialize(() => {
    console.log("Creating table `postal_codes`...");
    db.run(`
      CREATE TABLE postal_codes (
        zipcode     TEXT NOT NULL,
        pref        TEXT NOT NULL,
        city        TEXT NOT NULL,
        town        TEXT NOT NULL,
        pref_kana   TEXT,
        city_kana   TEXT,
        town_kana   TEXT
      )
    `);

    console.log("Creating index on `zipcode` column...");
    db.run("CREATE INDEX idx_zipcode ON postal_codes (zipcode)");

    // Prepare insert statement for performance
    const stmt = db.prepare(`
      INSERT INTO postal_codes (zipcode, pref, city, town, pref_kana, city_kana, town_kana)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Setup CSV parser
    const parser = parse({
      relax_column_count: true,
    });

    // Use transaction for bulk insert to improve speed
    db.run("BEGIN TRANSACTION");

    let count = 0;
    parser.on("readable", () => {
      let record;
      while ((record = parser.read()) !== null) {
        // The columns from utf_ken_all.csv are:
        // 2: zipcode (7 digits)
        // 3: pref_kana
        // 4: city_kana
        // 5: town_kana
        // 6: pref
        // 7: city
        // 8: town
        stmt.run(
          record[2],
          record[6],
          record[7],
          record[8],
          record[3],
          record[4],
          record[5]
        );
        count++;
        if (count % 1000 === 0) {
          process.stdout.write(`\rProcessed ${count} records...`);
        }
      }
    });

    parser.on("end", () => {
      stmt.finalize();
      db.run("COMMIT", (err) => {
        if (err) {
          console.error("Transaction commit error:", err.message);
        } else {
          console.log(`\nSuccessfully imported ${count} records.`);
        }

        // Close the database connection
        db.close((err) => {
          if (err) {
            console.error("Error closing database:", err.message);
          } else {
            console.log("Database connection closed. Process finished.");
          }
        });
      });
    });

    parser.on("error", (err) => {
      console.error("CSV parsing error:", err.message);
      db.run("ROLLBACK");
      db.close();
    });

    // Read the CSV file and pipe it to the parser
    console.log(`Reading CSV file: ${csvFilePath}`);
    fs.createReadStream(csvFilePath).pipe(parser);
  });
}

main();
