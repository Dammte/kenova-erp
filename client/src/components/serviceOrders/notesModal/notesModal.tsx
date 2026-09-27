"use client";

import { API_URL, apiFetch } from "@/lib/api";
import { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Clock,
  User,
  Smartphone,
  StickyNote,
} from "lucide-react";
import { showToast } from "nextjs-toast-notify";
import styles from "./notesModal.module.css";

interface ServiceNote {
  id: string;
  serviceOrderId: string;
  content: string;
  createdAt: string;
  createdBy?: string;
  type?: "normal" | "important" | "urgent";
}

interface Client {
  id: string;
  firstName: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  city?: string;
}

interface Device {
  brand: string;
  model: string;
  imei?: string;
  code?: string;
  pattern?: string;
}

interface ServiceOrder {
  id: string;
  client: Client;
  device: Device;
}

interface NotesModalProps {
  order: ServiceOrder;
  onClose: () => void;
}

export const NotesModal: React.FC<NotesModalProps> = ({ order, onClose }) => {
  const [orderNotes, setOrderNotes] = useState<ServiceNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteType, setNewNoteType] = useState<"normal" | "important" | "urgent">("normal");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const fetchOrderNotes = async (orderId: string) => {
    try {
      setLoadingNotes(true);
      const response = await apiFetch(`${API_URL}/service-orders/${orderId}/sticky-notes`
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();
      setOrderNotes(data);
    } catch (error) {
      showToast.error("Error al cargar las notas", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "fadeIn",
      });
    } finally {
      setLoadingNotes(false);
    }
  };

  const createNote = async (
    orderId: string,
    noteData: Partial<ServiceNote>
  ) => {
    try {
      const response = await apiFetch(`${API_URL}/service-orders/${orderId}/sticky-notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: noteData.content,
            type: noteData.type ?? "normal",
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const newNote = await response.json();
      setOrderNotes((prev) => [...prev, newNote]);

      showToast.success("Nota agregada correctamente", {
        duration: 3000,
        progress: true,
        position: "top-right",
        transition: "fadeIn",
      });

      return newNote;
    } catch (error) {
      showToast.error("Error al crear la nota", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "fadeIn",
      });
      throw error;
    }
  };

  const deleteNote = async (orderId: string, noteId: string) => {
    try {
      const response = await apiFetch(`${API_URL}/service-orders/${orderId}/sticky-notes/${noteId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      setOrderNotes(orderNotes.filter((note) => note.id !== noteId));

      showToast.success("Nota eliminada correctamente", {
        duration: 3000,
        progress: true,
        position: "top-right",
        transition: "fadeIn",
      });
    } catch (error) {
      showToast.error("Error al eliminar la nota", {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "fadeIn",
      });
    }
  };

  useEffect(() => {
    fetchOrderNotes(order.id);
  }, [order.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) {
      showToast.warning("Por favor ingrese el contenido de la nota", {
        duration: 3000,
        progress: true,
        position: "top-right",
        transition: "fadeIn",
      });
      return;
    }

    try {
      setIsAddingNote(true);
      await createNote(order.id, {
        content: newNoteContent.trim(),
        type: newNoteType,
      });
      setNewNoteContent("");
      setNewNoteType("normal");
    } catch {
      // Error already shown by createNote
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = (noteId: string) => {
    setPendingDeleteNoteId(noteId);
  };

  const confirmDeleteNote = async () => {
    if (!pendingDeleteNoteId) return;
    const id = pendingDeleteNoteId;
    setPendingDeleteNoteId(null);
    await deleteNote(order.id, id);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "urgent":
        return styles.noteUrgent;
      case "important":
        return styles.noteImportant;
      default:
        return styles.noteNormal;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "urgent":
        return "Urgente";
      case "important":
        return "Importante";
      default:
        return "Normal";
    }
  };

  return (
    <div className={styles.notesModalOverlay}>
      <div className={styles.notesModal} ref={modalRef}>
        {/* Header */}
        <div className={styles.notesModalHeader}>
          <div className={styles.notesModalTitle}>
            <StickyNote size={20} />
            <h3>Notas de Orden #{order.id.substring(0, 8)}</h3>
          </div>
          <button onClick={onClose} className={styles.closeButton}>
            ×
          </button>
        </div>

        {/* Order Info */}
        <div className={styles.notesOrderInfo}>
          <div className={styles.notesOrderDetail}>
            <User size={14} />
            <span>
              {order.client.firstName} {order.client.lastName || ""}
            </span>
          </div>
          <div className={styles.notesOrderDetail}>
            <Smartphone size={14} />
            <span>{order.device.model}</span>
          </div>
        </div>

        {/* Notes List */}
        <div className={styles.notesListContainer}>
          {loadingNotes ? (
            <div className={styles.notesLoading}>
              <div className={styles.loadingSpinner}></div>
              <p>Cargando notas...</p>
            </div>
          ) : orderNotes.length > 0 ? (
            <div className={styles.notesList}>
              {orderNotes
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                )
                .map((note) => (
                  <div
                    key={note.id}
                    className={`${styles.noteItem} ${getTypeColor(
                      note.type || "normal"
                    )}`}
                  >
                    <div className={styles.noteHeader}>
                      <div className={styles.noteMetadata}>
                        <span className={styles.noteDate}>
                          <Clock size={12} />
                          {new Intl.DateTimeFormat("es-ES", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(note.createdAt))}
                        </span>
                        {note.type && note.type !== "normal" && (
                          <span className={styles.notePriorityBadge}>
                            {getTypeLabel(note.type)}
                          </span>
                        )}
                      </div>
                      {pendingDeleteNoteId === note.id ? (
                        <div className={styles.deleteConfirm}>
                          <button
                            onClick={() => void confirmDeleteNote()}
                            className={styles.deleteConfirmYes}
                            title="Confirmar eliminación"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setPendingDeleteNoteId(null)}
                            className={styles.deleteConfirmNo}
                            title="Cancelar"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className={styles.deleteNoteButton}
                          title="Eliminar nota"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className={styles.noteContent}>{note.content}</div>
                    {note.createdBy && (
                      <div className={styles.noteFooter}>
                        <span className={styles.noteAuthor}>
                          Por: {note.createdBy}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div className={styles.notesEmpty}>
              <StickyNote size={32} className={styles.notesEmptyIcon} />
              <p>No hay notas para esta orden</p>
              <span>Agrega la primera nota usando el formulario abajo</span>
            </div>
          )}
        </div>

        {/* Add Note Form */}
        <div className={styles.addNoteSection}>
          <div className={styles.addNoteForm}>
            <div className={styles.noteInputGroup}>
              <textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Escribe una nota sobre esta orden..."
                className={styles.noteTextarea}
                rows={3}
                disabled={isAddingNote}
              />
              <div className={styles.noteFormActions}>
                <select
                  value={newNoteType}
                  onChange={(e) =>
                    setNewNoteType(
                      e.target.value as "normal" | "important" | "urgent"
                    )
                  }
                  className={styles.notePrioritySelect}
                  disabled={isAddingNote}
                >
                  <option value="normal">Normal</option>
                  <option value="important">Importante</option>
                  <option value="urgent">Urgente</option>
                </select>
                <button
                  onClick={handleAddNote}
                  className={styles.addNoteButton}
                  disabled={isAddingNote || !newNoteContent.trim()}
                >
                  {isAddingNote ? (
                    <>
                      <div className={styles.buttonSpinner}></div>
                      Agregando...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Agregar Nota
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
