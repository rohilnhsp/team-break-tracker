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

    const channel = supabase
      .channel('team-members')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_members' },
        (payload) => {
          setTeam((prev) => {
            if (payload.eventType === 'DELETE') {
              return prev.filter((m) => m.id !== payload.old.id)
            } else if (payload.eventType === 'UPDATE') {
              return prev.map((m) =>
                m.id === payload.new.id ? payload.new : m
              )
            } else if (payload.eventType === 'INSERT') {
              return [...prev, payload.new]
            } else return prev
          })
        }
      )
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
        {team.map((member) => (
          <li key={member.id} className="mb-2">
            {member.name} — {member.status} —{' '}
            {member.break_duration ? `${member.break_duration} mins` : ''}
            <button
              onClick={() =>
                punchAction(
                  member.id,
                  member.status === 'Online' ? 'break_in' : 'break_out'
                )
              }
              className="ml-2 px-2 py-1 bg-blue-500 text-white rounded"
            >
              {member.status === 'Online' ? 'Start Break' : 'End Break'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
