# AI-Powered Recruitment Management System – Backend

## 📌 Project Overview
The AI-Powered Recruitment Management System is designed to simplify and improve the recruitment process. It supports candidate management, resume processing, AI-based resume evaluation, job matching, and application status tracking.

## 🚀 Key Features
- Candidate registration and management
- Resume upload and processing
- Resume classification and evaluation
- 12-parameter candidate-job matching
- Candidate application status tracking
- Database operations using Prisma ORM
- REST-style API endpoints using Next.js Route Handlers

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Backend/API | Next.js Route Handlers |
| Language | TypeScript |
| ORM | Prisma ORM |
| Database | SQLite |
| AI/NLP | Rule-based NLP and text matching utilities |

## 📂 Project Structure
```text
backend/
├── app/
│   └── api/
├── prisma/
│   └── schema.prisma
├── public/
├── package.json
├── tsconfig.json
└── README.md
```

*Note: Update this structure according to the actual backend folder.*

## ⚙️ Installation and Setup

### 1. Clone the Repository
```bash
git clone https://github.com/pranavi5774-lang/Hiresphere-ai-Backend.git
```

### 2. Navigate to the Project
```bash
cd Hiresphere-ai-Backend
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Create a `.env` file and configure the database connection according to the project's Prisma setup.

Example:
```env
DATABASE_URL="file:./dev.db"
```

### 5. Generate Prisma Client
```bash
npx prisma generate
```

### 6. Start the Development Server
```bash
npm run dev
```

## 🗄️ Database
The project uses SQLite as its database and Prisma ORM for database operations. The Prisma schema is maintained in:

```text
prisma/schema.prisma
```

## 🧠 AI/NLP Processing
The system uses text-processing and rule-based evaluation techniques to analyze resumes and compare candidate profiles with job requirements. It includes a 12-parameter evaluation approach and a separate TF-IDF/cosine similarity utility.

## 🔐 Security
- Environment variables are used for configuration.
- Sensitive credentials should not be committed to GitHub.
- `.env` files and generated dependencies should be excluded from version control.

## 👩‍💻 Contributors
- Pranavi Jadhav
- Vijayalaxmi Mhetri
- Sakshi Sable

## 📌 Project Status
Academic final-year project – Under Development.

## 📄 License
This project is developed for academic purposes.
