import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const Dashboard = () => {
  const [fullData, setFullData] = useState(null);
  const [filteredData, setFilteredData] = useState(null);
  const [selectedDay, setSelectedDay] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('gridbriks_theme') || 'dark';
  });

  // Sync theme attribute to document and localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gridbriks_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const response = await fetch(`${baseUrl}/api/wind-analysis`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        setFullData(result);
        setFilteredData(result); 
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filter the data when a user selects a specific day
  useEffect(() => {
    if (!fullData || selectedDay === 'all') {
      setFilteredData(fullData);
      return;
    }

    const filteredTimeseries = fullData.timeseries.filter(item => {
      // Extract the date part (YYYY-MM-DD) from the ISO string
      const itemDate = item.startTime.split('T')[0];
      return itemDate === selectedDay;
    });

    // Recalculate metrics just for the selected day
    let mae = 0;
    let rmse = 0;
    const count = filteredTimeseries.length;

    if (count > 0) {
      let sumAbsError = 0;
      let sumSqError = 0;
      filteredTimeseries.forEach(d => {
        sumAbsError += d.absolute_error_mw;
        sumSqError += Math.pow(d.error_mw, 2);
      });
      mae = (sumAbsError / count).toFixed(2);
      rmse = Math.sqrt(sumSqError / count).toFixed(2);
    }

    setFilteredData({
      timeseries: filteredTimeseries,
      metrics: {
        mean_absolute_error_mw: mae,
        rmse_mw: rmse,
        total_data_points: count
      }
    });
  }, [selectedDay, fullData]);

  // Europe/London is enforced explicitly — not left to the browser's locale —
  // because the UK grid operates on fixed half-hourly settlement periods that
  // are defined in London time (including BST transitions). Displaying in a
  // different timezone would misalign chart labels with the actual settlement
  // period boundaries reported by Elexon.
  const formatTime = (timeStr) => {
    const date = new Date(timeStr);
    return selectedDay === 'all'
      ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
      : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  };

  if (loading) {
    return (
      <div className="loading-state" data-theme={theme}>
        <div className="loading-spinner"></div>
        <div>Loading UK Grid Telemetry...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state" data-theme={theme}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>Error loading data: {error}</div>
      </div>
    );
  }

  if (!filteredData) return null;

  // Generate an array of days in Jan 2026 for the dropdown
  const daysInJan = Array.from({length: 31}, (_, i) => {
    const day = (i + 1).toString().padStart(2, '0');
    return `2026-01-${day}`;
  });

  const isDark = theme === 'dark';
  const forecastColor = isDark ? '#38bdf8' : '#2563eb';
  const actualColor = isDark ? '#34d399' : '#059669';
  const gridStroke = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.07)';
  const axisColor = isDark ? '#71717a' : '#64748b';
  const axisLine = isDark ? '#27272a' : '#e2e8f0';

  return (
    <div className="dashboard-container" data-theme={theme}>
      {/* Top Header Section */}
      <header className="dashboard-header">
        <div className="header-titles">
          <div className="header-tag">
            <span>National Grid ESO &bull; Elexon BMRS Telemetry</span>
          </div>
          <h1 className="dashboard-title">UK Wind Generation: Forecast vs Actual</h1>
          <p className="dashboard-subtitle">
            <svg className="subtitle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            Day-Ahead Market Analysis (WINDFOR vs FUELHH) &bull; January 2026
          </p>
        </div>
        
        {/* Controls: Date Selector + Theme Toggle */}
        <div className="header-controls">
          <div className="date-selector-wrapper">
            <label htmlFor="day-selector" className="selector-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
              <span>Timeline Filter</span>
            </label>
            <div className="select-container">
              <select 
                id="day-selector"
                value={selectedDay} 
                onChange={(e) => setSelectedDay(e.target.value)}
                className="styled-select"
              >
                <option value="all">Full Month Overview (31 Days)</option>
                {daysInJan.map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <div className="select-chevron">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          {/* Theme Toggle Button */}
          <button 
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          >
            {isDark ? (
              <>
                <svg className="theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
                <span>Light</span>
              </>
            ) : (
              <>
                <svg className="theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Metrics Grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Mean Absolute Error</span>
            <span className="metric-badge">MAE</span>
          </div>
          <div className="metric-value">
            {filteredData.metrics.mean_absolute_error_mw} <span className="unit">MW</span>
          </div>
          <span className="metric-desc">Average magnitude of forecast deviations</span>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Root Mean Squared Error</span>
            <span className="metric-badge">RMSE</span>
          </div>
          <div className="metric-value">
            {filteredData.metrics.rmse_mw} <span className="unit">MW</span>
          </div>
          <span className="metric-desc">Penalizes higher deviation anomalies</span>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Total Data Points</span>
            <span className="metric-badge">30-MIN BLOCKS</span>
          </div>
          <div className="metric-value">
            {filteredData.metrics.total_data_points}
          </div>
          <span className="metric-desc">Synchronized settlement intervals</span>
        </div>
      </div>

      {/* Recharts Line Chart */}
      <div className="chart-container">
        <div className="chart-header-row">
          <h2>
            Generation Timeline
            <span className="chart-pill">
              {selectedDay === 'all' ? 'Jan 1 – Jan 31, 2026' : selectedDay}
            </span>
          </h2>
          <div className="chart-legend-custom">
            <div className="legend-item">
              <span className="legend-dot forecast"></span>
              <span>Day-Ahead Forecast (MW)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot actual"></span>
              <span>Actual Outturn (MW)</span>
            </div>
          </div>
        </div>

        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={430}>
            <LineChart data={filteredData.timeseries} margin={{ top: 15, right: 25, left: 15, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis 
                dataKey="startTime" 
                tickFormatter={formatTime} 
                minTickGap={selectedDay === 'all' ? 45 : 30}
                stroke={axisLine}
                tick={{ fill: axisColor, fontSize: 12, fontWeight: 500 }}
                tickLine={{ stroke: axisLine }}
              />
              <YAxis 
                stroke={axisLine}
                tick={{ fill: axisColor, fontSize: 12, fontWeight: 500 }}
                tickLine={{ stroke: axisLine }}
                label={{ value: 'Output (MW)', angle: -90, position: 'insideLeft', fill: axisColor, fontSize: 12, offset: 5 }} 
              />
              {/*
               * Tooltip labelFormatter enforces Europe/London — same rationale
               * as formatTime above: settlement periods are defined in UK local
               * time, so the tooltip timestamp must reflect that, not the
               * viewer's browser timezone.
               */}
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#0c0c0e' : '#ffffff',
                  borderColor: isDark ? '#27272a' : '#e2e8f0',
                  borderRadius: '14px',
                  boxShadow: isDark
                    ? '0 16px 36px -4px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.08)'
                    : '0 16px 36px -4px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                  color: isDark ? '#f4f4f5' : '#0f172a',
                  padding: '16px 22px',
                  fontSize: '15px',
                  lineHeight: '1.6',
                }}
                labelStyle={{
                  fontWeight: 700,
                  fontSize: '14px',
                  color: isDark ? '#94a3b8' : '#475569',
                  marginBottom: '10px',
                  borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                  paddingBottom: '8px',
                }}
                itemStyle={{
                  fontSize: '15px',
                  fontWeight: 600,
                  padding: '4px 0',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                labelFormatter={(label) => new Date(label).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Europe/London',
                })}
                formatter={(value, name) => [
                  `${Number(value).toLocaleString()} MW`,
                  name === 'generation_forecast' ? 'Day-Ahead Forecast' : 'Actual Outturn',
                ]}
              />
              <Line 
                type="monotone" 
                dataKey="generation_forecast" 
                name="generation_forecast" 
                stroke={forecastColor} 
                strokeWidth={2.2} 
                dot={false}
                activeDot={{ r: 5, fill: forecastColor, stroke: isDark ? '#000000' : '#ffffff', strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="generation_actual" 
                name="generation_actual" 
                stroke={actualColor} 
                strokeWidth={2.2} 
                dot={false}
                activeDot={{ r: 5, fill: actualColor, stroke: isDark ? '#000000' : '#ffffff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;