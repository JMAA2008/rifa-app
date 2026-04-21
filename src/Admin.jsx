import React, { useState, useEffect } from 'react';
import { Settings, Check, RotateCcw, Lock } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function Admin() {
  const [autenticado, setAutenticado] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorLogin, setErrorLogin] = useState('');
  const [numeros, setNumeros] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState('');

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
    await Promise.all([cargarNumeros(), cargarConfig()]);
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

  const confirmarPago = async (n) => {
    await supabase.from('numeros').update({ estado: 'pagado' }).eq('numero', n);
  };

  const liberarNumero = async (n) => {
    if (!confirm('Liberar el numero ' + n.toString().padStart(2, '0') + '?')) return;
    await supabase.from('numeros').update({
      estado: 'disponible', nombre_comprador: null, telefono_comprador: null, fecha_apartado: null
    }).eq('numero', n);
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
      titular_cuenta: config.titular_cuenta
    }).eq('id', 1);
    if (error) setMensajeConfig('Error al guardar');
    else setMensajeConfig('Guardado correctamente');
    setGuardandoConfig(false);
    setTimeout(() => setMensajeConfig(''), 3000);
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Settings className="w-6 h-6" /> Panel de Administracion
            </h2>
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

        <details className="bg-white rounded-2xl p-6 shadow-2xl">
          <summary className="cursor-pointer font-bold text-gray-800 text-lg">Configuracion de la rifa</summary>
          <div className="mt-4 space-y-3">
            <div><label className="text-sm font-medium text-gray-700">Titulo</label>
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
      </div>
    </div>
  );
}
