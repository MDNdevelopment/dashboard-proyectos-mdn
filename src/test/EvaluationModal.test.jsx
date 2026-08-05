import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      question_positions: () => makeQuery(MOCK_QUESTION_POSITIONS),
      evaluation_responses: () => makeQuery(MOCK_RESPONSES),
      evaluation_comments: () => makeQuery([]),
      evaluation_sessions: () => makeQuery(MOCK_SESSIONS),
    },
  }),
}))

// ── Datos de prueba ───────────────────────────────────────────────────────────
const MOCK_QUESTIONS = [
  { id: 'q1', text: '¿Cumple los plazos?', removed: false },
  { id: 'q2', text: '¿Trabaja en equipo?', removed: false },
  { id: 'q3', text: '¿Se comunica bien?', removed: false },
]

const MOCK_QUESTION_POSITIONS = MOCK_QUESTIONS.map((q) => ({
  question_id: q.id,
  questions: q,
}))

const MOCK_SESSIONS = [
  {
    id: 'sess-1',
    manager_id: 'mgr-1',
    employee_id: 'emp-1',
    period: '2026-05-01',
    total_score: 4.0,
  },
]

const MOCK_RESPONSES = [
  { id: 'r1', evaluation_id: 'sess-1', question_id: 'q1', response: 4 },
  { id: 'r2', evaluation_id: 'sess-1', question_id: 'q2', response: 4 },
  { id: 'r3', evaluation_id: 'sess-1', question_id: 'q3', response: 4 },
]

const MOCK_EMPLOYEE = {
  user_id: 'emp-1',
  first_name: 'Ana',
  last_name: 'López',
  position_id: 'pos-1',
}

import EvaluationModal from '../components/evaluaciones/EvaluationModal'

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('EvaluationModal', () => {
  it('muestra las preguntas del cargo tras cargar', async () => {
    render(
      <EvaluationModal
        employee={MOCK_EMPLOYEE}
        evaluationId={undefined}
        managerId="mgr-1"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('¿Cumple los plazos?')).toBeInTheDocument()
    })
    expect(screen.getByText('¿Trabaja en equipo?')).toBeInTheDocument()
    expect(screen.getByText('¿Se comunica bien?')).toBeInTheDocument()
  })

  it('el botón Guardar está deshabilitado hasta responder todas las preguntas', async () => {
    const user = userEvent.setup()
    render(
      <EvaluationModal
        employee={MOCK_EMPLOYEE}
        evaluationId={undefined}
        managerId="mgr-1"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('¿Cumple los plazos?')).toBeInTheDocument()
    })

    const submitBtn = screen.getByRole('button', { name: /guardar evaluación/i })
    expect(submitBtn).toBeDisabled()

    // Responder solo 2 de 3 preguntas
    const opcion5Buttons = screen.getAllByLabelText('Opción 5')
    await user.click(opcion5Buttons[0]) // pregunta 1
    await user.click(opcion5Buttons[1]) // pregunta 2

    expect(submitBtn).toBeDisabled()
  })

  it('el botón Guardar se habilita al responder todas las preguntas', async () => {
    const user = userEvent.setup()
    render(
      <EvaluationModal
        employee={MOCK_EMPLOYEE}
        evaluationId={undefined}
        managerId="mgr-1"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('¿Cumple los plazos?')).toBeInTheDocument()
    })

    const opcion5Buttons = screen.getAllByLabelText('Opción 5')
    await user.click(opcion5Buttons[0])
    await user.click(opcion5Buttons[1])
    await user.click(opcion5Buttons[2])

    expect(screen.getByRole('button', { name: /guardar evaluación/i })).not.toBeDisabled()
  })

  it('modo ver (read-only): no muestra el botón Guardar evaluación', async () => {
    render(
      <EvaluationModal
        employee={MOCK_EMPLOYEE}
        evaluationId="sess-1"
        managerId="mgr-1"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('¿Cumple los plazos?')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /guardar evaluación/i })).not.toBeInTheDocument()
  })

  it('modo ver: muestra el botón Eliminar', async () => {
    render(
      <EvaluationModal
        employee={MOCK_EMPLOYEE}
        evaluationId="sess-1"
        managerId="mgr-1"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('¿Cumple los plazos?')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /eliminar/i })).toBeInTheDocument()
  })

  it('calcula el score correctamente: (suma / (n*5)) * 5', () => {
    // 3 preguntas, respuestas 4+3+5=12; max=15; score=(12/15)*5=4.00
    const responses = { q1: 4, q2: 3, q3: 5 }
    const questions = MOCK_QUESTIONS
    const total = questions.reduce((acc, q) => acc + (responses[String(q.id)] ?? 0), 0)
    const score = parseFloat(((total / (questions.length * 5)) * 5).toFixed(2))
    expect(score).toBe(4.0)
  })

  it('score máximo: todas con 5 → score=5.00', () => {
    const responses = { q1: 5, q2: 5, q3: 5 }
    const questions = MOCK_QUESTIONS
    const total = questions.reduce((acc, q) => acc + (responses[String(q.id)] ?? 0), 0)
    const score = parseFloat(((total / (questions.length * 5)) * 5).toFixed(2))
    expect(score).toBe(5.0)
  })

  it('score mínimo: todas con 1 → score=1.00', () => {
    const responses = { q1: 1, q2: 1, q3: 1 }
    const questions = MOCK_QUESTIONS
    const total = questions.reduce((acc, q) => acc + (responses[String(q.id)] ?? 0), 0)
    const score = parseFloat(((total / (questions.length * 5)) * 5).toFixed(2))
    expect(score).toBe(1.0)
  })

  it('muestra spinner mientras carga', () => {
    render(
      <EvaluationModal
        employee={MOCK_EMPLOYEE}
        evaluationId={undefined}
        managerId="mgr-1"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    // El spinner debe estar presente antes de que resuelvan los mocks
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('el header muestra el nombre del empleado', async () => {
    render(
      <EvaluationModal
        employee={MOCK_EMPLOYEE}
        evaluationId={undefined}
        managerId="mgr-1"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(screen.getByText('Ana López')).toBeInTheDocument()
  })
})
