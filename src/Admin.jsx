import React, { useState, useEffect, useMemo } from 'react';
import { Settings, Check, RotateCcw, Lock, Search, Trash2, RefreshCw, Archive, Phone, MessageCircle, Eye } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function Admin() {
  const [autenticado, setAutenticado] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorLogin, setErrorLogin] = useState('');
  const [numeros, setNumeros] = useState([]);
  const [config, setConfig] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [rifaDetalle, setRifaDetalle] = useState(null);
  const [procesando, setProcesando] = useState(false);

  const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || '';

  useEffect(() => {
    const sessionAuth = sessionStorage.getItem('rifa-admin-auth');
    if (sessionAuth === 'ok') setAutenticado(true);
  }, []);

  useEffect(() => {
    if (!autenticado) return;
    cargarTodo();
    const canal = supabase.channel('admin-canal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'numeros' }, () => cargarNumeros())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rifas_historicas' }, () => cargarHistorial())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [autenticado]);

  const login = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setAutenticado(true);
      sessionStorage.setItem('rifa-admin-auth', 'ok');
      setPasswordInput('');
      setErrorLogin('');
    } else setErrorLogin('Contrasena incorrecta');
  };

  const logout = () => {
    sessionStorage.removeItem('rifa-admin-auth');
    setAutenticado(false);
  };

  const cargarTodo = async () => {
    await Promise.all([cargarNumeros(), cargarConfig(), cargarHistorial()]);
    setLoading(false);
  };

  const cargarNumeros = async () => {
    const { data } = await supabase.from('numeros').select('*').order('numero', { ascending: true });
    if (data) setNumeros(data);
  };

  const cargarConfig = async () => {
    const { data } = await supabase.from('config').select('*').eq('id', 1).single();
    if (data) setConfig(data);
  };

  const cargarHistorial = async () => {
    const { data } = await supabase.from('rifas_historicas').select('*').order('fecha_cierre', { ascending: false });
    if (data) setHistorial(data);
  };

  const confirmarPago = async (n) => {
    await supabase.from('numeros').update({ estado: 'pagado' }).eq('numero', n);
  };

  const liberarNumero = async (n) => {
    if (!confirm('Liberar el numero ' + n.toString().padStart(2, '0') + '?')) return;
    await supabase.from('numeros').update({
      estado: 'disponible', nombre_comprador: null, telefono_comprador: null, fecha_apartado: null
    }).eq('numero', n);
  };

  const liberarTodosApartados = async () => {
    const cantidad = numeros.filter(n => n.estado === 'apartado').length;
    if (cantidad === 0) { alert('No hay numeros apartados'); return; }
    if (!confirm('Seguro que quieres LIBERAR TODOS los ' + cantidad + ' numeros apartados? Esta accion no se puede deshacer.')) return;
    setProcesando(true);
    await supabase.from('numeros').update({
      estado: 'disponible', nombre_comprador: null, telefono_comprador: null, fecha_apartado: null
    }).eq('estado', 'apartado');
    setProcesando(false);
  };

  const liberarTodosPagados = async () => {
    const cantidad = numeros.filter(n => n.estado === 'pagado').length;
    if (cantidad === 0) { alert('No hay numeros pagados'); return; }
    if (!confirm('Seguro que quieres LIBERAR TODOS los ' + cantidad + ' numeros pagados? Esta accion no se puede deshacer.')) return;
    setProcesando(true);
    await supabase.from('numeros').update({
      estado: 'disponible', nombre_comprador: null, telefono_comprador: null, fecha_apartado: null
    }).eq('estado', 'pagado');
    setProcesando(false);
  };

  const iniciarNuevaRifa = async () => {
    const nombrePropuesto = config.nombre_rifa || 'Rifa sin nombre';
    const nombreFinal = prompt('Vas a cerrar la rifa actual y empezar una nueva.\n\nEscribe el nombre con el que quieres guardarla en el historial:', nombrePropuesto);
    if (nombreFinal === null) return;
    if (!nombreFinal.trim()) { alert('Debes poner un nombre'); return; }
    if (!confirm('Confirmar: cerrar rifa "' + nombreFinal + '" y empezar una nueva?\n\nSe guardara en el historial y todos los numeros volveran a disponibles.')) return;

    setProcesando(true);

    const pagados = numeros.filter(n => n.estado === 'pagado');
    const apartados = numeros.filter(n => n.estado === 'apartado');
    const compradoresUnicos = new Set();
    [...pagados, ...apartados].forEach(n => { if (n.telefono_comprador) compradoresUnicos.add(n.telefono_comprador); });

    const snapshot = {
      nombre_rifa: nombreFinal,
      titulo_rifa: config.titulo_rifa,
      premio: config.premio,
      precio_numero: config.precio_numero,
      total_recaudado: pagados.length * config.precio_numero,
      total_participantes: compradoresUnicos.size,
      total_numeros_vendidos: pagados.length,
      detalle_completo: numeros.filter(n => n.estado !== 'disponible').map(n => ({
        numero: n.numero, estado: n.estado,
        nombre: n.nombre_comprador, telefono: n.telefono_comprador,
        fecha: n.fecha_apartado
      }))
    };

    const { error: errorInsert } = await supabase.from('rifas_historicas').insert(snapshot);
    if (errorInsert) { alert('Error al guardar historial: ' + errorInsert.message); setProcesando(false); return; }

    await supabase.from('numeros').update({
      estado: 'disponible', nombre_comprador: null, telefono_comprador: null, fecha_apartado: null
    }).neq('estado', 'disponible');

    await supabase.from('config').update({ nombre_rifa: 'Rifa actual' }).eq('id', 1);

    setProcesando(false);
    alert('Rifa "' + nombreFinal + '" guardada en historial. Ya puedes empezar una nueva!');
  };

  const eliminarRifaHistorica = async (id, nombre) => {
    if (!confirm('Eliminar PERMANENTEMENTE la rifa "' + nombre + '" del historial?')) return;
    await supabase.from('rifas_historicas').delete().eq('id', id);
  };

  const guardarConfigCampo = (campo, valor) => setConfig({ ...config, [campo]: valor });

  const persistirConfig = async () => {
    setGuardandoConfig(true);
    const { error } = await supabase.from('config').update({
      titulo_rifa: config.titulo_rifa,
      premio: config.premio,
      precio_numero: config.precio_numero,
      whatsapp_destino: config.whatsapp_destino,
      cuenta_bancaria: config.cuenta_bancaria,
      titular_cuenta: config.titular_cuenta,
      nombre_rifa: config.nombre_rifa
    }).eq('id', 1);
    if (error) setMensajeConfig('Error al guardar');
    else setMensajeConfig('Guardado correctamente');
    setGuardandoConfig(false);
    setTimeout(() => setMensajeConfig(''), 3000);
  };

  // Resultados de busqueda
  const resultadosBusqueda = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.trim().toLowerCase();
    return numeros.filter(n => {
      if (n.estado === 'disponible') {
        const numeroStr = n.numero.toString().padStart(2, '0');
        return numeroStr === q || n.numero.toString() === q;
      }
      const numeroStr = n.numero.toString().padStart(2, '0');
      const nombre = (n.nombre_comprador || '').toLowerCase();
      const tel = (n.telefono_comprador || '').toLowerCase();
      return numeroStr.includes(q) || n.numero.toString() === q || nombre.includes(q) || tel.includes(q);
    });
  }, [busqueda, numeros]);

  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-6 h-6 text-purple-600" />
            <h2 className="text-2xl font-bold text-gray-800">Panel Admin</h2>
          </div>
          <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-purple-500 focus:outline-none mb-3"
            placeholder="Contrasena" autoFocus />
          {errorLogin && <div className="text-red-600 text-sm mb-3">{errorLogin}</div>}
          <button onClick={login} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-bold transition">Entrar</button>
          <a href="/" className="block text-center text-purple-600 hover:underline mt-4 text-sm">Volver a la rifa</a>
        </div>
      </div>
    );
  }

  if (loading || !config) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    );
  }

  const disponibles = numeros.filter(n => n.estado === 'disponible').length;
  const apartados = numeros.filter(n => n.estado === 'apartado').length;
  const pagados = numeros.filter(n => n.estado === 'pagado').length;

  const getBadgeEstado = (estado) => {
    if (estado === 'disponible') return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-bold">DISPONIBLE</span>;
    if (estado === 'apartado') return <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-bold">APARTADO</span>;
    if (estado === 'pagado') return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-bold">PAGADO</span>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* HEADER */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Settings className="w-6 h-6" /> Panel de Administracion
              </h2>
              <p className="text-sm text-gray-500 mt-1">Rifa actual: <strong>{config.nombre_rifa}</strong></p>
            </div>
            <div className="flex gap-2">
              <a href="/" className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg text-gray-800 font-medium">Ver rifa</a>
              <button onClick={logout} className="bg-red-100 hover:bg-red-200 px-4 py-2 rounded-lg text-red-700 font-medium">Salir</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-green-100 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-700">{disponibles}</div>
              <div className="text-xs text-green-900">Disponibles</div>
            </div>
            <div className="bg-yellow-100 rounded-lg p-3">
              <div className="text-2xl font-bold text-yellow-700">{apartados}</div>
              <div className="text-xs text-yellow-900">Apartados</div>
            </div>
            <div className="bg-red-100 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-700">{pagados}</div>
              <div className="text-xs text-red-900">Pagados</div>
            </div>
          </div>
          <div className="mt-3 text-center text-gray-700 font-semibold">
            Recaudado: ${pagados * config.precio_numero} / Potencial: ${(pagados + apartados) * config.precio_numero}
          </div>
        </div>

        {/* BUSCADOR */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <h3 className="font-bold text-lg text-gray-800 mb-3 flex items-center gap-2">
            <Search className="w-5 h-5" /> Buscar (numero / nombre / telefono)
          </h3>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej: 03, Juan, 444..."
            className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-purple-500 focus:outline-none"
          />
          {busqueda.trim() && (
            <div className="mt-3 space-y-2">
              {resultadosBusqueda.length === 0 ? (
                <div className="text-gray-500 text-center py-4">Sin resultados</div>
              ) : (
                resultadosBusqueda.map(n => (
                  <div key={n.numero} className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl font-bold text-gray-800">#{n.numero.toString().padStart(2, '0')}</span>
                          {getBadgeEstado(n.estado)}
                        </div>
                        {n.estado !== 'disponible' && (
                          <div className="text-sm text-gray-700">
                            <div>👤 {n.nombre_comprador}</div>
                            <div>📱 {n.telefono_comprador}</div>
                            {n.fecha_apartado && <div className="text-xs text-gray-500">📅 {new Date(n.fecha_apartado).toLocaleString('es-MX')}</div>}
                          </div>
                        )}
                      </div>
                      {n.estado !== 'disponible' && n.telefono_comprador && (
                        <div className="flex gap-2">
                          <a href={`https://wa.me/${n.telefono_comprador.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                            className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1">
                            <MessageCircle className="w-4 h-4" /> WhatsApp
                          </a>
                          <a href={`tel:${n.telefono_comprador}`}
                            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1">
                            <Phone className="w-4 h-4" /> Llamar
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* CONFIGURACION */}
        <details className="bg-white rounded-2xl p-6 shadow-2xl">
          <summary className="cursor-pointer font-bold text-gray-800 text-lg">⚙️ Configuracion de la rifa</summary>
          <div className="mt-4 space-y-3">
            <div><label className="text-sm font-medium text-gray-700">Nombre de esta rifa (interno, para el historial)</label>
              <input type="text" value={config.nombre_rifa} onChange={(e) => guardarConfigCampo('nombre_rifa', e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
            <div><label className="text-sm font-medium text-gray-700">Titulo (visible al publico)</label>
              <input type="text" value={config.titulo_rifa} onChange={(e) => guardarConfigCampo('titulo_rifa', e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
            <div><label className="text-sm font-medium text-gray-700">Premio</label>
              <input type="text" value={config.premio} onChange={(e) => guardarConfigCampo('premio', e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
            <div><label className="text-sm font-medium text-gray-700">Precio por numero ($)</label>
              <input type="number" value={config.precio_numero} onChange={(e) => guardarConfigCampo('precio_numero', Number(e.target.value))} className="w-full border rounded-lg px-3 py-2" /></div>
            <div><label className="text-sm font-medium text-gray-700">WhatsApp (formato 521 + 10 digitos)</label>
              <input type="text" value={config.whatsapp_destino} onChange={(e) => guardarConfigCampo('whatsapp_destino', e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
            <div><label className="text-sm font-medium text-gray-700">Cuenta bancaria</label>
              <input type="text" value={config.cuenta_bancaria} onChange={(e) => guardarConfigCampo('cuenta_bancaria', e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
            <div><label className="text-sm font-medium text-gray-700">Titular de la cuenta</label>
              <input type="text" value={config.titular_cuenta} onChange={(e) => guardarConfigCampo('titular_cuenta', e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
            <button onClick={persistirConfig} disabled={guardandoConfig} className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold">
              {guardandoConfig ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {mensajeConfig && <span className="ml-3 text-sm text-green-700">{mensajeConfig}</span>}
          </div>
        </details>

        {/* ACCIONES MASIVAS */}
        <details className="bg-white rounded-2xl p-6 shadow-2xl">
          <summary className="cursor-pointer font-bold text-gray-800 text-lg">🔧 Acciones masivas</summary>
          <div className="mt-4 space-y-3">
            <button onClick={liberarTodosApartados} disabled={procesando || apartados === 0}
              className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-white px-4 py-3 rounded-lg font-semibold flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5" /> Liberar todos los apartados ({apartados})
            </button>
            <button onClick={liberarTodosPagados} disabled={procesando || pagados === 0}
              className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white px-4 py-3 rounded-lg font-semibold flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5" /> Liberar todos los pagados ({pagados})
            </button>
            <button onClick={iniciarNuevaRifa} disabled={procesando}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg">
              <RefreshCw className="w-5 h-5" /> INICIAR NUEVA RIFA (guarda historial)
            </button>
            <p className="text-xs text-gray-500 text-center">Al iniciar nueva rifa: la actual se guarda en el historial y todos los numeros vuelven a disponibles.</p>
          </div>
        </details>

        {/* APARTADOS */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <h3 className="font-bold text-lg text-gray-800 mb-3">Apartados (pendientes de pago)</h3>
          {apartados === 0 ? (
            <div className="text-gray-500 text-center py-4">No hay numeros apartados</div>
          ) : (
            <div className="space-y-2">
              {numeros.filter(n => n.estado === 'apartado').map(n => (
                <div key={n.numero} className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex-wrap gap-2">
                  <div>
                    <div className="font-bold text-xl text-yellow-900">#{n.numero.toString().padStart(2, '0')}</div>
                    <div className="text-sm text-gray-700">
                      {n.nombre_comprador} - {n.telefono_comprador}
                      {n.fecha_apartado && <div className="text-xs text-gray-500">{new Date(n.fecha_apartado).toLocaleString('es-MX')}</div>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => confirmarPago(n.numero)} className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1">
                      <Check className="w-4 h-4" /> Pagado
                    </button>
                    <button onClick={() => liberarNumero(n.numero)} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1">
                      <RotateCcw className="w-4 h-4" /> Liberar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PAGADOS */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <h3 className="font-bold text-lg text-gray-800 mb-3">Pagados</h3>
          {pagados === 0 ? (
            <div className="text-gray-500 text-center py-4">No hay numeros pagados</div>
          ) : (
            <div className="space-y-2">
              {numeros.filter(n => n.estado === 'pagado').map(n => (
                <div key={n.numero} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3 flex-wrap gap-2">
                  <div>
                    <div className="font-bold text-xl text-red-900">#{n.numero.toString().padStart(2, '0')}</div>
                    <div className="text-sm text-gray-700">{n.nombre_comprador} - {n.telefono_comprador}</div>
                  </div>
                  <button onClick={() => liberarNumero(n.numero)} className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-2 rounded-lg text-sm font-medium">
                    <RotateCcw className="w-4 h-4 inline" /> Liberar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HISTORIAL */}
        <details className="bg-white rounded-2xl p-6 shadow-2xl">
          <summary className="cursor-pointer font-bold text-gray-800 text-lg flex items-center gap-2">
            <Archive className="w-5 h-5" /> Historial de rifas pasadas ({historial.length})
          </summary>
          <div className="mt-4 space-y-2">
            {historial.length === 0 ? (
              <div className="text-gray-500 text-center py-4">Aun no hay rifas guardadas en el historial</div>
            ) : (
              historial.map(r => (
                <div key={r.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div>
                      <div className="font-bold text-gray-800">{r.nombre_rifa}</div>
                      <div className="text-xs text-gray-500">{new Date(r.fecha_cierre).toLocaleString('es-MX')}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setRifaDetalle(rifaDetalle?.id === r.id ? null : r)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-sm flex items-center gap-1">
                        <Eye className="w-4 h-4" /> {rifaDetalle?.id === r.id ? 'Ocultar' : 'Ver'}
                      </button>
                      <button onClick={() => eliminarRifaHistorica(r.id, r.nombre_rifa)}
                        className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded-lg text-sm flex items-center gap-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="bg-white p-2 rounded"><div className="font-bold text-green-700">${r.total_recaudado}</div><div className="text-xs text-gray-500">Recaudado</div></div>
                    <div className="bg-white p-2 rounded"><div className="font-bold text-purple-700">{r.total_numeros_vendidos}</div><div className="text-xs text-gray-500">Vendidos</div></div>
                    <div className="bg-white p-2 rounded"><div className="font-bold text-blue-700">{r.total_participantes}</div><div className="text-xs text-gray-500">Personas</div></div>
                  </div>
                  {rifaDetalle?.id === r.id && r.detalle_completo && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 max-h-64 overflow-y-auto">
                      {r.detalle_completo.map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-sm bg-white p-2 rounded flex-wrap gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">#{d.numero.toString().padStart(2, '0')}</span>
                            {d.estado === 'pagado' ? <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">PAGADO</span>
                              : <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full">APARTADO</span>}
                          </div>
                          <div className="text-gray-700 text-xs">{d.nombre} - {d.telefono}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </details>

      </div>
    </div>
  );
}
