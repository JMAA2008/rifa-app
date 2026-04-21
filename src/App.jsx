import React, { useState, useEffect } from 'react';
import { Ticket, X, MessageCircle, User, Phone, AlertCircle, Key, Copy, Check } from 'lucide-react';
import { supabase } from './supabaseClient';

// Genera clave aleatoria de 5 caracteres sin confusos (sin 0, O, 1, I, L)
function generarClave() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let clave = '';
  for (let i = 0; i < 5; i++) {
    clave += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return clave;
}

export default function App() {
  const [numeros, setNumeros] = useState([]);
  const [config, setConfig] = useState(null);
  const [seleccionados, setSeleccionados] = useState([]);
  const [vista, setVista] = useState('rifa'); // 'rifa' | 'formulario' | 'exito'
  const [formData, setFormData] = useState({ nombre: '', telefono: '' });
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultadoExito, setResultadoExito] = useState(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    cargarDatos();
    const canal = supabase
      .channel('numeros-canal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'numeros' }, () => cargarNumeros())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config' }, () => cargarConfig())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  const cargarDatos = async () => {
    await Promise.all([cargarNumeros(), cargarConfig()]);
    setLoading(false);
  };

  const cargarNumeros = async () => {
    const { data, error } = await supabase.from('numeros').select('*').order('numero', { ascending: true });
    if (!error && data) setNumeros(data);
  };

  const cargarConfig = async () => {
    const { data, error } = await supabase.from('config').select('*').eq('id', 1).single();
    if (!error && data) setConfig(data);
  };

  const toggleNumero = (n) => {
    const num = numeros.find(x => x.numero === n);
    if (!num || num.estado !== 'disponible') return;
    if (seleccionados.includes(n)) setSeleccionados(seleccionados.filter(s => s !== n));
    else setSeleccionados([...seleccionados, n].sort((a, b) => a - b));
  };

  const enviarWhatsApp = async () => {
    if (!formData.nombre.trim() || !formData.telefono.trim()) {
      alert('Por favor llena tu nombre y telefono');
      return;
    }
    if (seleccionados.length === 0) return;
    setEnviando(true);

    const { data: verificacion } = await supabase.from('numeros').select('numero, estado').in('numero', seleccionados);
    const noDisponibles = verificacion?.filter(n => n.estado !== 'disponible') || [];
    if (noDisponibles.length > 0) {
      alert('Los numeros ' + noDisponibles.map(n => n.numero).join(', ') + ' ya no estan disponibles. Por favor vuelve a seleccionar.');
      setEnviando(false);
      setSeleccionados([]);
      setVista('rifa');
      cargarNumeros();
      return;
    }

    // Generar clave unica para este apartado
    const clave = generarClave();

    const { error } = await supabase.from('numeros').update({
      estado: 'apartado',
      nombre_comprador: formData.nombre,
      telefono_comprador: formData.telefono,
      clave_verificacion: clave,
      fecha_apartado: new Date().toISOString()
    }).in('numero', seleccionados).eq('estado', 'disponible');

    if (error) {
      alert('Error al apartar los numeros. Intenta de nuevo.');
      setEnviando(false);
      return;
    }

    const total = seleccionados.length * config.precio_numero;
    const numerosTexto = seleccionados.map(n => '#' + n.toString().padStart(2, '0')).join(', ');
    const numerosApartados = [...seleccionados];

    const linkPagoTexto = config.link_pago_alternativo
      ? `\n\n*¿No tienes cuenta Nequi?*\nPaga desde cualquier banco aqui:\n${config.link_pago_alternativo}`
      : '';

    const mensaje = `Hola! Quiero apartar numeros de la rifa:

*${config.titulo_rifa}*
Premio: ${config.premio}

*Numeros a apartar:* ${numerosTexto}
*Cantidad:* ${seleccionados.length} numero(s)
*Total a pagar:* $${total}

*Mis datos:*
Nombre: ${formData.nombre}
Telefono: ${formData.telefono}

🔑 *MI CLAVE DE VERIFICACION:* ${clave}
⚠️ Guardala! La necesitaras si resultas ganador.

*Datos para el deposito:*
${config.cuenta_bancaria}
A nombre de: ${config.titular_cuenta}${linkPagoTexto}

Envio el comprobante de pago por este medio. Gracias!`;

    const url = 'https://wa.me/' + config.whatsapp_destino + '?text=' + encodeURIComponent(mensaje);
    window.open(url, '_blank');

    // Guardar resultado para mostrarlo en pantalla de exito
    setResultadoExito({
      clave,
      numeros: numerosApartados,
      nombre: formData.nombre,
      total
    });

    setSeleccionados([]);
    setFormData({ nombre: '', telefono: '' });
    setVista('exito');
    setEnviando(false);
  };

  const copiarClave = () => {
    if (!resultadoExito) return;
    navigator.clipboard.writeText(resultadoExito.clave).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  const volverARifa = () => {
    setResultadoExito(null);
    setCopiado(false);
    setVista('rifa');
  };

  const disponibles = numeros.filter(n => n.estado === 'disponible').length;
  const apartados = numeros.filter(n => n.estado === 'apartado').length;
  const pagados = numeros.filter(n => n.estado === 'pagado').length;

  const getColorNumero = (n) => {
    if (seleccionados.includes(n.numero)) return 'bg-blue-500 text-white ring-4 ring-blue-300 scale-105';
    if (n.estado === 'disponible') return 'bg-green-500 hover:bg-green-600 text-white cursor-pointer hover:scale-105';
    if (n.estado === 'apartado') return 'bg-yellow-500 text-white cursor-not-allowed opacity-80';
    if (n.estado === 'pagado') return 'bg-red-600 text-white cursor-not-allowed opacity-80';
    return 'bg-gray-300';
  };

  if (loading || !config) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {vista === 'rifa' && (
          <>
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <Ticket className="w-10 h-10 text-yellow-400" />
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-white">{config.titulo_rifa}</h1>
                  <p className="text-purple-200 text-sm md:text-base">Premio: {config.premio}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <div className="bg-white/20 rounded-lg px-3 py-2 text-white"><strong>${config.precio_numero}</strong> por numero</div>
                <div className="bg-green-500/30 rounded-lg px-3 py-2 text-white">{disponibles} disponibles</div>
                <div className="bg-yellow-500/30 rounded-lg px-3 py-2 text-white">{apartados} apartados</div>
                <div className="bg-red-500/30 rounded-lg px-3 py-2 text-white">{pagados} pagados</div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 mb-4 border border-white/20">
              <div className="flex flex-wrap gap-4 text-white text-sm justify-center">
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-green-500"></div> Disponible</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-blue-500"></div> Seleccionado</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-yellow-500"></div> Apartado</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-red-600"></div> Pagado</div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20 shadow-2xl">
              <div className="grid grid-cols-5 gap-3 md:gap-4">
                {numeros.map(n => (
                  <button key={n.numero} onClick={() => toggleNumero(n.numero)} disabled={n.estado !== 'disponible'}
                    className={`aspect-square rounded-xl font-bold text-2xl md:text-3xl transition-all duration-200 shadow-lg ${getColorNumero(n)}`}>
                    {n.numero.toString().padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            {seleccionados.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-blue-600 to-purple-600 shadow-2xl p-4 border-t-4 border-yellow-400">
                <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-white">
                    <div className="text-sm opacity-90">{seleccionados.length} numero(s): {seleccionados.map(n => n.toString().padStart(2, '0')).join(', ')}</div>
                    <div className="text-2xl font-bold">Total: ${seleccionados.length * config.precio_numero}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSeleccionados([])} className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg font-semibold transition">Limpiar</button>
                    <button onClick={() => setVista('formulario')} className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-bold transition flex items-center gap-2 shadow-lg">
                      <MessageCircle className="w-5 h-5" /> Continuar
                    </button>
                  </div>
                </div>
              </div>
            )}
            {seleccionados.length > 0 && <div className="h-32"></div>}
          </>
        )}

        {vista === 'formulario' && (
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-2xl max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Tus datos</h2>
              <button onClick={() => setVista('rifa')} className="text-gray-500 hover:text-gray-800"><X className="w-6 h-6" /></button>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
              <div className="text-sm text-purple-900 mb-1">Numeros a apartar:</div>
              <div className="font-bold text-lg text-purple-900">{seleccionados.map(n => '#' + n.toString().padStart(2, '0')).join(', ')}</div>
              <div className="text-2xl font-bold text-purple-900 mt-2">Total: ${seleccionados.length * config.precio_numero}</div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-gray-700 font-medium mb-2"><User className="w-4 h-4" /> Nombre completo</label>
                <input type="text" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-purple-500 focus:outline-none" placeholder="Ej. Juan Perez" />
              </div>
              <div>
                <label className="flex items-center gap-2 text-gray-700 font-medium mb-2"><Phone className="w-4 h-4" /> Telefono / WhatsApp</label>
                <input type="tel" value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 focus:border-purple-500 focus:outline-none" placeholder="Ej. 444 123 4567" />
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 mt-6 text-sm text-yellow-900">
              <AlertCircle className="w-5 h-5 inline mr-1" />
              <strong>Importante:</strong> Oprime "Apartar" y se abrira WhatsApp con el mensaje de apartado ya listo. Envia ese mensaje primero para que tus numeros queden registrados a tu nombre, y luego realiza el pago con los datos de pago que te llegaran en el chat.
            </div>

            <button onClick={enviarWhatsApp} disabled={enviando}
              className="w-full mt-6 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white py-4 rounded-xl font-bold text-lg transition flex items-center justify-center gap-2 shadow-lg">
              <MessageCircle className="w-6 h-6" />
              {enviando ? 'Apartando...' : 'Apartar por WhatsApp'}
            </button>
          </div>
        )}

        {vista === 'exito' && resultadoExito && (
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-2xl max-w-lg mx-auto">
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
                <Check className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Numeros apartados!</h2>
              <p className="text-gray-600 mt-1">{resultadoExito.nombre}, tu apartado fue exitoso.</p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
              <div className="text-sm text-purple-900">Numeros:</div>
              <div className="font-bold text-lg text-purple-900">{resultadoExito.numeros.map(n => '#' + n.toString().padStart(2, '0')).join(', ')}</div>
              <div className="text-xl font-bold text-purple-900 mt-1">Total: ${resultadoExito.total}</div>
            </div>

            <div className="bg-gradient-to-r from-yellow-100 to-orange-100 border-2 border-yellow-400 rounded-xl p-5 mb-4">
              <div className="flex items-center gap-2 text-yellow-900 font-bold text-lg mb-2">
                <Key className="w-6 h-6" />
                Tu clave de verificacion:
              </div>
              <div className="bg-white rounded-lg p-4 flex items-center justify-between gap-3">
                <div className="text-3xl md:text-4xl font-mono font-bold tracking-widest text-purple-700 flex-1 text-center">
                  {resultadoExito.clave}
                </div>
                <button onClick={copiarClave}
                  className={`px-3 py-2 rounded-lg font-medium text-sm flex items-center gap-1 transition ${copiado ? 'bg-green-500 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}>
                  {copiado ? <><Check className="w-4 h-4" /> Copiado</> : <><Copy className="w-4 h-4" /> Copiar</>}
                </button>
              </div>
              <p className="text-sm text-yellow-900 mt-3 font-medium">
                ⚠️ <strong>Guarda esta clave!</strong> La necesitaras si resultas ganador para reclamar tu premio. Tambien la enviamos en el mensaje de WhatsApp.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-900">
              📩 <strong>Siguiente paso:</strong> ya se abrio WhatsApp con los datos de pago. Envia el mensaje y luego realiza tu deposito. Tus numeros estan apartados.
            </div>

            <button onClick={volverARifa}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold text-lg transition">
              Volver a la rifa
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
