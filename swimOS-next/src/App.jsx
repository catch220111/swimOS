import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import LogModal from './components/LogModal';
import HistoryView from './components/HistoryView';
import WorkoutView from './components/WorkoutView';
import { parseWorkoutCSV } from './utils/csvParser';
import { Home, Timer as TimerIcon, BarChart2 } from 'lucide-react';
import './index.css';

function App() {
  const [view, setView] = useState('dashboard'); // dashboard, workout, history
  const [isLogModalOpen, setLogModalOpen] = useState(false);
  const [workoutPlan, setWorkoutPlan] = useState(null);

  const startLiveWorkout = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseWorkoutCSV(e.target.result);
      if (result) {
        setWorkoutPlan(result);
        setView('workout');
      } else {
        alert('Invalid CSV');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-container">
      {view === 'dashboard' && (
        <Dashboard
          onNavigate={(target) => {
            if (target === 'log-modal') setLogModalOpen(true);
            else setView(target);
          }}
          onStartLive={startLiveWorkout}
        />
      )}

      {view === 'history' && <HistoryView />}

      {view === 'workout' && (
        workoutPlan ? (
          <WorkoutView
            workoutPlan={workoutPlan}
            onExit={() => {
              setWorkoutPlan(null);
              setView('history'); // Auto go to history like before
            }}
          />
        ) : (
          <div className="view active-view" style={{ padding: '40px', textAlign: 'center' }}>
            <h2>No Active Workout</h2>
            <button className="btn" onClick={() => setView('dashboard')}>Go Back</button>
          </div>
        )
      )}

      <LogModal
        isOpen={isLogModalOpen}
        onClose={() => setLogModalOpen(false)}
        onSaveSuccess={() => {
          if (view === 'history') {
            window.location.reload();
          } else {
            setView('history');
          }
        }}
      />

      {/* Bottom Nav (Hidden in workout view usually, but keeping for now or hiding) */}
      {view !== 'workout' && (
        <nav id="bottom-nav">
          <div className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
            <Home size={24} />
            <span>Home</span>
          </div>
          <div className={`nav-item ${view === 'workout' ? 'active' : ''}`} onClick={() => setView('workout')}>
            <TimerIcon size={24} />
            <span>Workout</span>
          </div>
          <div className={`nav-item ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}>
            <BarChart2 size={24} />
            <span>History</span>
          </div>
        </nav>
      )}
    </div>
  );
}

export default App;
