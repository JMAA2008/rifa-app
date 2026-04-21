import React, { useState, useEffect } from 'react';
import { Ticket, X, MessageCircle, User, Phone, AlertCircle } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function App() {
  const [numeros, setNumeros] = useState([]);
  const [config, setConfig] = useState(null);
  const [seleccionados, setSeleccionados] = useState([]);
  const [vista, setVista] = useState('rifa');
  const [formData, setFormData] = useState({ nombre: '', telefono: '' });
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

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

    const { error } = await supabase.from('numeros').update({
      estado: 'apartado',
      nombre_comprador: formData.nombre,
      telefono_comprador: formData.telefono,
      fecha_apartado: new Date().toISOString()
    }).in('numero', seleccionados).eq('estado', 'disponible');

    if (error) {
      alert('Error al apartar los numeros. Intenta de nuevo.');
      setEnviando(false);
      return;
    }

    const total = seleccionados.length * config.precio_numero;
    const numerosTexto = seleccionados.map(n => '#' + n.toString().padStart(2, '0')).join(', ');

    const mensaje = `Hola! Quiero apartar numeros de la rifa:

*${config.titulo_rifa}*
Premio: ${config.premio}

*Numeros a apartar:* ${numerosTexto}
*Cantidad:* ${seleccionados.length} numero(s)
*Total a pagar:* $${total}

*Mis datos:*
Nombre: ${formData.nombre}
Telefono: ${formData.telefono}

*Datos para el deposito:*
${config.cuenta_bancaria}
A nombre de: ${config.titular_cuenta}

Envio el comprobante de pago por este medio. Gracias!`;

    const url = 'https://wa.me/' + config.whatsapp_destino + '?text=' + encodeURIComponent(mensaje);
    window.open(url, '_blank');

    setSeleccionados([]);
    setFormData({ nombre: '', telefono: '' });
    setVista('rifa');
    setEnviando(false);
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
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-2xl max-w-lg mx-
