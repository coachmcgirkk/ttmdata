import React from "react";

function PublishNotes({ notes }) {
  if (!notes || !notes.length) return null;
  return (
    <div className="publish-note">
      {notes.map(note => (
        <p key={note}>{note}</p>
      ))}
    </div>
  );
}

export default PublishNotes;
