import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function AdminPanel() {
  const [team, setTeam] = useState([])

  useEffect(() => {
    const fetchTeam = async () => {
      const { data } = await supabase.from('team_members').select('*')
      setTeam(data)
    }
    fetchTeam()
  }, [])

  const removeUser = async (id) => {
    await supabase.from('team_members').delete().eq('id', id)
  }

  const exportCSV = () => {
    let csv = 'Name,Email,Status,Break Duration\n'
    team.forEach((t) => {
      csv += `${t.name},${t.email},${t.status},${t.break_duration || 0}\n`
    })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'team_data.csv'
    a.click()
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Admin Panel</h1>
      <button onClick={exportCSV} className="mb-4 px-2 py-1 bg-blue-500 text-white rounded">
        Export CSV
      </button>
      <ul>
        {team.map((member) => (
          <li key={member.id} className="mb-2">
            {member.name} — {member.email} — {member.status}
            <button
              onClick={() => removeUser(member.id)}
              className="ml-2 px-2 py-1 bg-red-500 text-white rounded"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
