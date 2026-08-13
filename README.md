# ⚽ FPL AI Tactical Squad Planner

[![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.3.1-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Hosting-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)

An AI-powered **Fantasy Premier League (FPL) tactical planner and squad optimizer** inspired by the tactical depth and notification feeds of *Football Manager*. 

The app combines machine learning expected points ($xP$) predictive modeling, historical player metrics ($xG, xA, \text{ICT Index}$), multi-gameweek fixture difficulty heatmaps, and a real-time **Assistant Manager Alert Feed** to automate tactical squad decisions.

---

## 🌟 Key Features

### 1. 🏟️ Tactical Pitch View & Formation Switcher
* **Interactive Field Graphic**: Real-time positioning of starting XI across custom formations (`4-3-3`, `3-5-2`, `4-4-2`, `3-4-3`).
* **Player Intelligence Cards**: Displays player team, price, predicted points ($xP$), and injury severity flags.
* **Captaincy & Bench Management**: 1-click captain ($C$) toggling and dynamic substitution between starters and bench players.

### 2. ⚡ Football Manager-Style Assistant Manager Feed
* **Urgent Tactical Alerts**: Real-time digest flagging critical squad conditions before the gameweek deadline.
* **Injury & Suspension Warnings**: Detects 75% and 50% injury risks (e.g. *Saka hamstring strain*) with 1-click auto-swap tactical recommendations.
* **Double & Blank Gameweek (DGW/BGW) Notices**: Automatically detects schedule congestion and suggests chip activation strategies.
* **Form Slump Detection**: Identifies underperforming high-cost assets with declining $xG$ trends.

### 3. 📈 AI Transfer & Analytics Hub
* **Automated Transfer Recommendations**: Evaluates combinatorial player swaps ranked by net points gain ($\Delta xP$) within budget limits.
* **Head-to-Head Radar Analytics**: Visual comparisons across $xG$, $xA$, Key Passes, ICT Index, and upcoming 5-match FDR.
* **Price Change Predictor**: Nightly price rise/fall indicators to preserve team value.

### 4. 🗓️ Multi-Gameweek Fixture & Chip Matrix
* **20-Team FDR Heatmap**: Multi-gameweek schedule matrix color-coded from Green (FDR 1) to Red (FDR 5).
* **Chip Strategy Roadmap**: Dedicated timeline planner for **Wildcard**, **Free Hit**, **Triple Captain**, and **Bench Boost** activation.

---

## 🛠️ Tech Stack & Architecture

* **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons
* **Build Tool**: Vite 5
* **Data Seam Layer**: Modular service architecture (`src/services/fplStorageService.ts`) decoupled for direct integration with the official Premier League API (`fantasy.premierleague.com/api/bootstrap-static/`).
* **Hosting**: Firebase Hosting (Multi-Site Preview Channel isolation).

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```

### 3. Build Production Bundle
```bash
npm run build
```

---

## 🌐 Deployment to Firebase Hosting

To deploy updates to the isolated Firebase preview channel without affecting other prototypes:

```bash
npm run build
npx firebase-tools hosting:channel:deploy fpl-ai-planner-preview
```

---

## 📄 License
MIT License. Built with 💚 for FPL managers.
