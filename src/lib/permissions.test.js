import { describe, it, expect } from 'vitest'
import { canAccessModule, can } from './permissions'

const BASE_USER = {
  user_id: 'user-1',
  department_id: 10,
  position_id: 20,
  access_level: 1,
  admin: false,
}

const ADMIN_USER = { ...BASE_USER, admin: true }
const LEVEL2_USER = { ...BASE_USER, access_level: 2 }
const LEVEL3_USER = { ...BASE_USER, access_level: 3 }
const OTHER_DEPT_USER = { ...BASE_USER, department_id: 99 }

// ──────────────────────────────────────────────
// Admin siempre pasa
// ──────────────────────────────────────────────
describe('admin override', () => {
  it('admin pasa sin importar las reglas', () => {
    const config = {
      ads: { rules: [{ all: [{ type: 'min_level', value: 5 }] }] },
    }
    expect(canAccessModule('ads', ADMIN_USER, config)).toBe(true)
  })

  it('admin pasa cuando no hay config', () => {
    expect(canAccessModule('ads', ADMIN_USER, {})).toBe(true)
  })
})

// ──────────────────────────────────────────────
// Sin perfil → false
// ──────────────────────────────────────────────
describe('sin perfil', () => {
  it('retorna false si userProfile es null', () => {
    expect(canAccessModule('ads', null, {})).toBe(false)
  })

  it('retorna false si userProfile es undefined', () => {
    expect(canAccessModule('ads', undefined, {})).toBe(false)
  })
})

// ──────────────────────────────────────────────
// Sin reglas → acceso libre
// ──────────────────────────────────────────────
describe('default abierto (sin reglas)', () => {
  it('módulo sin entrada en config → accesible a todos', () => {
    expect(canAccessModule('ads', BASE_USER, {})).toBe(true)
  })

  it('módulo con rules:[] → accesible a todos', () => {
    expect(canAccessModule('ads', BASE_USER, { ads: { rules: [] } })).toBe(true)
  })

  it('config undefined → accesible a todos', () => {
    expect(canAccessModule('ads', BASE_USER, undefined)).toBe(true)
  })
})

// ──────────────────────────────────────────────
// Condición: min_level
// ──────────────────────────────────────────────
describe('condición min_level', () => {
  const config = {
    reportes: { rules: [{ all: [{ type: 'min_level', value: 3 }] }] },
  }

  it('nivel 1 no pasa nivel mínimo 3', () => {
    expect(canAccessModule('reportes', BASE_USER, config)).toBe(false)
  })

  it('nivel 2 no pasa nivel mínimo 3', () => {
    expect(canAccessModule('reportes', LEVEL2_USER, config)).toBe(false)
  })

  it('nivel 3 sí pasa nivel mínimo 3', () => {
    expect(canAccessModule('reportes', LEVEL3_USER, config)).toBe(true)
  })
})

// ──────────────────────────────────────────────
// Condición: department
// ──────────────────────────────────────────────
describe('condición department', () => {
  const config = {
    ads: { rules: [{ all: [{ type: 'department', ids: [10, 11] }] }] },
  }

  it('departamento coincide → pasa', () => {
    expect(canAccessModule('ads', BASE_USER, config)).toBe(true) // department_id=10
  })

  it('departamento no coincide → no pasa', () => {
    expect(canAccessModule('ads', OTHER_DEPT_USER, config)).toBe(false) // department_id=99
  })

  it('ids vacíos → no pasa', () => {
    const c = { ads: { rules: [{ all: [{ type: 'department', ids: [] }] }] } }
    expect(canAccessModule('ads', BASE_USER, c)).toBe(false)
  })
})

// ──────────────────────────────────────────────
// Condición: user
// ──────────────────────────────────────────────
describe('condición user', () => {
  const config = {
    ads: { rules: [{ all: [{ type: 'user', ids: ['user-1', 'user-2'] }] }] },
  }

  it('user_id en la lista → pasa', () => {
    expect(canAccessModule('ads', BASE_USER, config)).toBe(true)
  })

  it('user_id no en la lista → no pasa', () => {
    const other = { ...BASE_USER, user_id: 'user-99' }
    expect(canAccessModule('ads', other, config)).toBe(false)
  })
})

// ──────────────────────────────────────────────
// Condición: position
// ──────────────────────────────────────────────
describe('condición position', () => {
  const config = {
    tareas: { rules: [{ all: [{ type: 'position', ids: [20, 21] }] }] },
  }

  it('position_id coincide → pasa', () => {
    expect(canAccessModule('tareas', BASE_USER, config)).toBe(true) // position_id=20
  })

  it('position_id no coincide → no pasa', () => {
    const other = { ...BASE_USER, position_id: 99 }
    expect(canAccessModule('tareas', other, config)).toBe(false)
  })
})

// ──────────────────────────────────────────────
// AND dentro de grupo
// ──────────────────────────────────────────────
describe('AND dentro de grupo', () => {
  const config = {
    ads: {
      rules: [{
        all: [
          { type: 'department', ids: [10] },
          { type: 'min_level', value: 2 },
        ],
      }],
    },
  }

  it('cumple departamento pero no nivel → no pasa', () => {
    // department_id=10 ✓ pero access_level=1 ✗
    expect(canAccessModule('ads', BASE_USER, config)).toBe(false)
  })

  it('cumple nivel pero no departamento → no pasa', () => {
    const u = { ...LEVEL2_USER, department_id: 99 }
    expect(canAccessModule('ads', u, config)).toBe(false)
  })

  it('cumple departamento Y nivel → pasa', () => {
    const u = { ...LEVEL2_USER, department_id: 10 }
    expect(canAccessModule('ads', u, config)).toBe(true)
  })
})

// ──────────────────────────────────────────────
// OR entre grupos (ejemplo exacto del usuario)
// "Redes Y nivel≥2, O la persona X"
// ──────────────────────────────────────────────
describe('OR entre grupos (caso exacto del usuario)', () => {
  const config = {
    ads: {
      rules: [
        { all: [{ type: 'department', ids: [10] }, { type: 'min_level', value: 2 }] },
        { all: [{ type: 'user', ids: ['persona-x'] }] },
      ],
    },
  }

  it('nivel 1 en dept 10 → no pasa (falla AND del grupo 1)', () => {
    expect(canAccessModule('ads', BASE_USER, config)).toBe(false)
  })

  it('nivel 2 en dept 10 → pasa (grupo 1 OK)', () => {
    const u = { ...LEVEL2_USER, department_id: 10 }
    expect(canAccessModule('ads', u, config)).toBe(true)
  })

  it('persona X en dept diferente, nivel 1 → pasa (grupo 2 OK)', () => {
    const u = { ...BASE_USER, user_id: 'persona-x', department_id: 99 }
    expect(canAccessModule('ads', u, config)).toBe(true)
  })

  it('usuario que no cumple ningún grupo → no pasa', () => {
    const u = { ...BASE_USER, user_id: 'nadie', department_id: 99 }
    expect(canAccessModule('ads', u, config)).toBe(false)
  })
})

// ──────────────────────────────────────────────
// Grupo vacío (sin condiciones = pasa siempre)
// ──────────────────────────────────────────────
describe('grupo vacío', () => {
  it('grupo con all:[] pasa siempre (acceso libre explícito)', () => {
    const config = { ads: { rules: [{ all: [] }] } }
    expect(canAccessModule('ads', BASE_USER, config)).toBe(true)
  })
})

// ──────────────────────────────────────────────
// Tipo desconocido
// ──────────────────────────────────────────────
describe('tipo de condición desconocido', () => {
  it('tipo no reconocido → condición falla', () => {
    const config = { ads: { rules: [{ all: [{ type: 'unknown', ids: ['anything'] }] }] } }
    expect(canAccessModule('ads', BASE_USER, config)).toBe(false)
  })
})

// ──────────────────────────────────────────────
// can() — alias de canAccessModule
// ──────────────────────────────────────────────
describe('can() alias', () => {
  it('can() y canAccessModule son la misma función', () => {
    expect(can).toBe(canAccessModule)
  })
})

// ──────────────────────────────────────────────
// Claves de capacidad granulares (tabs y acciones)
// Escenario pedido por el usuario:
//   nivel 1 → solo ve Inicio de Empresa
//   nivel 2 → ve Inicio, Clientes y Líneas pero no modifica Líneas
//   nivel 4 → ve y modifica todo
// ──────────────────────────────────────────────
describe('capacidades granulares — empresa (escenario del usuario)', () => {
  const LEVEL4_USER = { ...BASE_USER, access_level: 4 }

  // empresa.general → sin reglas = abierto a todos
  const configEmpresa = {
    'empresa.clientes':        { rules: [{ all: [{ type: 'min_level', value: 2 }] }] },
    'empresa.lineas':          { rules: [{ all: [{ type: 'min_level', value: 2 }] }] },
    'empresa.lineas.manage':   { rules: [{ all: [{ type: 'min_level', value: 4 }] }] },
    'empresa.clientes.manage': { rules: [{ all: [{ type: 'min_level', value: 2 }] }] },
  }

  it('nivel 1 ve Inicio (sin reglas = abierto)', () => {
    expect(canAccessModule('empresa.general', BASE_USER, configEmpresa)).toBe(true)
  })

  it('nivel 1 NO ve Clientes', () => {
    expect(canAccessModule('empresa.clientes', BASE_USER, configEmpresa)).toBe(false)
  })

  it('nivel 1 NO ve Líneas', () => {
    expect(canAccessModule('empresa.lineas', BASE_USER, configEmpresa)).toBe(false)
  })

  it('nivel 2 ve Clientes', () => {
    expect(canAccessModule('empresa.clientes', LEVEL2_USER, configEmpresa)).toBe(true)
  })

  it('nivel 2 ve Líneas', () => {
    expect(canAccessModule('empresa.lineas', LEVEL2_USER, configEmpresa)).toBe(true)
  })

  it('nivel 2 NO modifica Líneas', () => {
    expect(canAccessModule('empresa.lineas.manage', LEVEL2_USER, configEmpresa)).toBe(false)
  })

  it('nivel 2 SÍ modifica Clientes', () => {
    expect(canAccessModule('empresa.clientes.manage', LEVEL2_USER, configEmpresa)).toBe(true)
  })

  it('nivel 4 ve y modifica Líneas', () => {
    expect(canAccessModule('empresa.lineas', LEVEL4_USER, configEmpresa)).toBe(true)
    expect(canAccessModule('empresa.lineas.manage', LEVEL4_USER, configEmpresa)).toBe(true)
  })

  it('admin siempre puede, sin importar nivel ni reglas', () => {
    expect(canAccessModule('empresa.lineas.manage', ADMIN_USER, configEmpresa)).toBe(true)
  })
})

// ──────────────────────────────────────────────
// Claves granulares para otros módulos
// ──────────────────────────────────────────────
describe('capacidades granulares — tareas (tabs por nivel)', () => {
  const configTareas = {
    'tareas.panorama': { rules: [{ all: [{ type: 'min_level', value: 2 }] }] },
    'tareas.team':     { rules: [{ all: [{ type: 'min_level', value: 2 }] }] },
    'tareas.standup':  { rules: [{ all: [{ type: 'min_level', value: 2 }] }] },
    // base y kanban sin reglas → abiertos
    'tareas.manage':   { rules: [{ all: [{ type: 'min_level', value: 2 }] }] },
  }

  it('nivel 1 no ve Panorama', () => {
    expect(canAccessModule('tareas.panorama', BASE_USER, configTareas)).toBe(false)
  })

  it('nivel 1 sí ve Base (sin reglas)', () => {
    expect(canAccessModule('tareas.base', BASE_USER, configTareas)).toBe(true)
  })

  it('nivel 1 no puede crear tareas', () => {
    expect(canAccessModule('tareas.manage', BASE_USER, configTareas)).toBe(false)
  })

  it('nivel 2 ve Panorama y puede crear tareas', () => {
    expect(canAccessModule('tareas.panorama', LEVEL2_USER, configTareas)).toBe(true)
    expect(canAccessModule('tareas.manage', LEVEL2_USER, configTareas)).toBe(true)
  })
})
