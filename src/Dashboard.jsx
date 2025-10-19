import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function Dashboard() {
  const [team, setTeam] = useState([])

  useEffect(() => {
    const fetchTeam = async () => {
      const { data, error } = await supabase.from('team_members').select('*')
      if (!error) setTeam(data)
    }

    fetchTeam()

    // Subscribe to realtime updates
    const channel = supabase
      .channel('team-members')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, payload => {
        setTeam(prev =>
          payload.eventType === 'DELETE'
            ? prev.filter(m => m.id !== payload.old.id)
            : prev.map(m => (m.id === payload.new.id ? payload.new : m))
        )
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const punchAction = async (id, action) => {
    await supabase.rpc('punch_action', { member_id: id, action_type: action })
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Team Break Tracker</h1>
      <ul>
        {team.map(member => (
          <li key={member.id} className="mb-2">
            {member.name} — {member.status}
            <button onClick={() => punchAction(member.id, member.status === 'Online' ? 'break_in' : 'break_out')} className="ml-2 px-2 py-1 bg-blue-500 text-white rounded">
              {member.status === 'Online' ? 'Start Break' : 'End Break'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
