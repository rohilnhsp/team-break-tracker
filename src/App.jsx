import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import AdminLogin from './AdminLogin'
import AdminPanel from './AdminPanel'

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public dashboard, no login required */}
        <Route path="/" element={<Dashboard />} />

        {/* Admin login page */}
        <Route path="/admin" element={<AdminLogin />} />

        {/* Admin panel, protected route */}
        <Route path="/admin/panel" element={<AdminPanel />} />
      </Routes>
    </Router>
  )
}
