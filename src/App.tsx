import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, 
  Users, 
  DollarSign, 
  Settings as SettingsIcon, 
  Plus, 
  Camera, 
  CheckCircle, 
  Clock, 
  MapPin, 
  Phone, 
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Edit2,
  Download,
  Moon,
  Sun,
  Image as ImageIcon,
  Save,
  X,
  CreditCard,
  FileText,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addMonths, isAfter, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isTomorrow, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import SignatureCanvas from 'react-signature-canvas';
// @ts-ignore
const SignaturePad = SignatureCanvas.default || SignatureCanvas;
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { Client, Service, FinancialRecord, AppSettings } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger', size?: 'default' | 'sm' | 'lg' | 'icon' }>(
  ({ className, variant = 'primary', size = 'default', ...props }, ref) => {
    const variants = {
      primary: 'bg-primary text-primary-foreground hover:opacity-90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
      danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    };
    const sizes = {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 rounded-md px-3',
      lg: 'h-11 rounded-md px-8',
      icon: 'h-10 w-10',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agenda' | 'clients' | 'financial' | 'settings'>('dashboard');
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [financials, setFinancials] = useState<FinancialRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>({});
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState({ name: '', whatsapp: '' });

  useEffect(() => {
    if (settings.company_name) {
      setCompanyInfo({ name: settings.company_name, whatsapp: settings.whatsapp_contact || '' });
    }
  }, [settings]);

  const handleSaveCompanyInfo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: companyInfo.name,
        whatsapp_contact: companyInfo.whatsapp
      })
    });
    fetchData();
  };

  const togglePushNotifications = async (enabled: boolean) => {
    if (enabled) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Permissão de notificação negada.');
        return;
      }
    }
    
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'push_notifications_enabled', value: enabled })
    });
    fetchData();
  };

  // Check for upcoming services to notify
  useEffect(() => {
    if (settings.push_notifications_enabled && services.length > 0) {
      const checkReminders = () => {
        const tomorrow = addDays(new Date(), 1);
        const upcoming = services.filter(s => 
          s.status === 'scheduled' && 
          isSameDay(parseISO(s.date), tomorrow)
        );

        upcoming.forEach(service => {
          const reminderKey = `reminder_${service.id}`;
          if (!localStorage.getItem(reminderKey)) {
            new Notification('Lembrete de Serviço', {
              body: `Serviço com ${service.client_name} amanhã às ${format(parseISO(service.date), 'HH:mm')}.`,
              icon: settings.logo
            });
            localStorage.setItem(reminderKey, 'sent');
          }
        });
      };

      const interval = setInterval(checkReminders, 1000 * 60 * 60); // Check every hour
      checkReminders(); // Initial check
      return () => clearInterval(interval);
    }
  }, [settings.push_notifications_enabled, services, settings.logo]);

  // Modals
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingFinancial, setEditingFinancial] = useState<FinancialRecord | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(new Date());
  const [selectedClientId, setSelectedClientId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (isServiceModalOpen && editingService) {
      setSelectedClientId(editingService.client_id);
    } else if (!isServiceModalOpen) {
      setSelectedClientId(undefined);
    }
  }, [isServiceModalOpen, editingService]);

  // Service Workflow State
  const [activeService, setActiveService] = useState<Service | null>(null);
  const sigPad = useRef<any>(null);

  useEffect(() => {
    fetchData();
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [sRes, cRes, fRes, stRes] = await Promise.all([
        fetch('/api/services'),
        fetch('/api/clients'),
        fetch('/api/financials'),
        fetch('/api/settings')
      ]);
      const servicesData = await sRes.json();
      setServices(servicesData.map((s: any) => ({
        ...s,
        photos_before: s.photos_before ? JSON.parse(s.photos_before) : [],
        photos_after: s.photos_after ? JSON.parse(s.photos_after) : []
      })));
      setClients(await cRes.json());
      setFinancials(await fRes.json());
      setSettings(await stRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleSaveService = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const selectedDate = selectedDay || new Date();
    const time = formData.get('time') as string;
    const [hours, minutes] = time.split(':').map(Number);
    selectedDate.setHours(hours, minutes, 0, 0);

    const data = {
      client_id: selectedClientId as number,
      date: selectedDate.toISOString(),
      value: parseFloat(formData.get('value') as string),
      payment_method: formData.get('payment_method') as string,
      installments: parseInt(formData.get('installments') as string || '1'),
    };

    if (editingService) {
      await fetch(`/api/services/${editingService.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
    setIsServiceModalOpen(false);
    setEditingService(null);
    fetchData();
  };

  const handleSaveClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      address: formData.get('address') as string,
      phone: formData.get('phone') as string,
    };

    if (editingClient) {
      await fetch(`/api/clients/${editingClient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
    setIsClientModalOpen(false);
    setEditingClient(null);
    fetchData();
  };

  const handleSaveFinancial = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      type: formData.get('type') as string,
      description: formData.get('description') as string,
      amount: parseFloat(formData.get('amount') as string),
      date: formData.get('date') as string,
      category: formData.get('category') as string,
    };

    if (editingFinancial) {
      await fetch(`/api/financials/${editingFinancial.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      await fetch('/api/financials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
    setIsFinancialModalOpen(false);
    setEditingFinancial(null);
    fetchData();
  };

  const handleUpdateServiceStatus = async (id: number, updates: Partial<Service>) => {
    await fetch(`/api/services/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    fetchData();
    if (activeService && activeService.id === id) {
      setActiveService({ ...activeService, ...updates });
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
    const file = e.target.files?.[0];
    if (file && activeService) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const currentPhotos = type === 'before' ? (activeService.photos_before || []) : (activeService.photos_after || []);
        const newPhotos = [...currentPhotos, base64];
        handleUpdateServiceStatus(activeService.id, { [type === 'before' ? 'photos_before' : 'photos_after']: newPhotos });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFinishService = async () => {
    if (!activeService || !sigPad.current) return;
    
    let signature = '';
    try {
      // Try to get trimmed canvas, if it fails due to the trim-canvas bug, fallback to raw canvas
      signature = sigPad.current.getTrimmedCanvas().toDataURL('image/png');
    } catch (e) {
      console.warn("getTrimmedCanvas failed, falling back to raw canvas", e);
      signature = sigPad.current.getCanvas().toDataURL('image/png');
    }

    await handleUpdateServiceStatus(activeService.id, { 
      status: 'completed', 
      signature,
      payment_method: (document.getElementById('payment_method') as HTMLSelectElement).value,
      installments: parseInt((document.getElementById('installments') as HTMLInputElement).value || '1')
    });

    // Automatically create an income financial record
    await fetch('/api/financials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'income',
        description: `Serviço #${activeService.id} - ${activeService.client_name}`,
        amount: activeService.value,
        date: new Date().toISOString(),
        category: 'serviço'
      })
    });

    setActiveService(null);
  };

  const generateInvoice = (service: Service) => {
    const doc = new jsPDF();
    const logo = settings.logo;
    
    if (logo) {
      doc.addImage(logo, 'PNG', 10, 10, 30, 30);
    }
    
    doc.setFontSize(20);
    doc.text('AF CLEAN - Recibo de Serviço', 50, 25);
    
    doc.setFontSize(12);
    doc.text(`Data: ${format(parseISO(service.date), 'dd/MM/yyyy')}`, 10, 50);
    doc.text(`Cliente: ${service.client_name}`, 10, 60);
    doc.text(`Endereço: ${service.client_address}`, 10, 70);
    doc.text(`Telefone: ${service.client_phone}`, 10, 80);
    
    doc.line(10, 85, 200, 85);
    
    doc.text('Descrição do Serviço:', 10, 95);
    doc.text('Limpeza e Higienização Profissional', 10, 105);
    
    doc.text(`Valor Total: R$ ${service.value.toFixed(2)}`, 10, 120);
    doc.text(`Forma de Pagamento: ${service.payment_method || 'N/A'}`, 10, 130);
    if (service.installments > 1) {
      doc.text(`Parcelas: ${service.installments}x`, 10, 140);
    }
    
    if (service.signature) {
      doc.text('Assinatura do Cliente:', 10, 160);
      doc.addImage(service.signature, 'PNG', 10, 165, 50, 20);
    }
    
    // Add photos to PDF if they exist
    let photoY = 190;
    if (service.photos_before && service.photos_before.length > 0) {
      doc.setFontSize(10);
      doc.text('Registro Antes:', 10, photoY);
      doc.addImage(service.photos_before[0], 'JPEG', 10, photoY + 5, 40, 30);
      photoY += 40;
    }
    if (service.photos_after && service.photos_after.length > 0) {
      doc.setFontSize(10);
      doc.text('Registro Depois:', 10, photoY);
      doc.addImage(service.photos_after[0], 'JPEG', 10, photoY + 5, 40, 30);
    }
    
    doc.setFontSize(10);
    doc.text('Próxima limpeza recomendada em 6 meses.', 10, 270);
    
    doc.save(`recibo-afclean-${service.id}.pdf`);
  };

  const generateFinancialReport = () => {
    const doc = new jsPDF();
    doc.text('AF CLEAN - Relatório Financeiro', 10, 10);
    
    const tableData = financials.map(f => [
      format(parseISO(f.date), 'dd/MM/yyyy'),
      f.description,
      f.type === 'income' ? 'Entrada' : 'Saída',
      `R$ ${f.amount.toFixed(2)}`
    ]);
    
    (doc as any).autoTable({
      head: [['Data', 'Descrição', 'Tipo', 'Valor']],
      body: tableData,
      startY: 20
    });
    
    const totalIncome = financials.filter(f => f.type === 'income').reduce((sum, f) => sum + f.amount, 0);
    const totalExpense = financials.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount, 0);
    
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.text(`Total Entradas: R$ ${totalIncome.toFixed(2)}`, 10, finalY);
    doc.text(`Total Saídas: R$ ${totalExpense.toFixed(2)}`, 10, finalY + 10);
    doc.text(`Lucro Líquido: R$ ${(totalIncome - totalExpense).toFixed(2)}`, 10, finalY + 20);
    
    doc.save('relatorio-financeiro-afclean.pdf');
  };

  const generateMonthlyFinancialReport = () => {
    const doc = new jsPDF();
    doc.text('AF CLEAN - Resumo Financeiro Mensal', 10, 10);

    const monthlySummary = financials.reduce((acc: any, f) => {
      const month = format(parseISO(f.date), 'MMMM yyyy', { locale: ptBR });
      if (!acc[month]) acc[month] = { income: 0, expense: 0 };
      if (f.type === 'income') acc[month].income += f.amount;
      else acc[month].expense += f.amount;
      return acc;
    }, {});

    let startY = 20;
    for (const month in monthlySummary) {
      doc.setFontSize(14);
      doc.text(month, 10, startY);
      startY += 10;
      doc.setFontSize(12);
      doc.text(`Entradas: R$ ${monthlySummary[month].income.toFixed(2)}`, 15, startY);
      startY += 7;
      doc.text(`Saídas: R$ ${monthlySummary[month].expense.toFixed(2)}`, 15, startY);
      startY += 7;
      doc.text(`Lucro: R$ ${(monthlySummary[month].income - monthlySummary[month].expense).toFixed(2)}`, 15, startY);
      startY += 15;
    }

    doc.save('resumo-financeiro-mensal-afclean.pdf');
  };

  const sendWhatsAppConfirmation = (service: Service) => {
    const message = `Olá ${service.client_name}! Gostaria de confirmar nosso serviço de limpeza agendado para amanhã, dia ${format(parseISO(service.date), 'dd/MM')}, às ${format(parseISO(service.date), 'HH:mm')}. Podemos confirmar?`;
    const phone = service.client_phone.replace(/\D/g, '');
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Sidebar / Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-md md:left-0 md:top-0 md:h-screen md:w-64 md:border-r md:border-t-0">
        <div className="flex h-full flex-row items-center justify-around p-2 md:flex-col md:justify-start md:gap-4 md:p-6">
          <div className="hidden flex-col items-center gap-3 md:mb-12 md:flex">
            <div className="vibrant-gradient relative flex h-20 w-20 items-center justify-center rounded-2xl p-1 shadow-[0_0_30px_rgba(0,240,255,0.2)]">
              {settings.logo ? (
                <div className="h-full w-full overflow-hidden rounded-xl bg-background">
                  <img src={settings.logo} alt="Logo" className="h-full w-full object-contain" />
                </div>
              ) : (
                <span className="text-3xl font-black text-white">AF</span>
              )}
            </div>
            <div className="text-center">
              <span className="text-xl font-black tracking-tighter text-foreground">AF CLEAN</span>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60">Premium Service</p>
            </div>
          </div>
          
          {[
            { id: 'dashboard', icon: Clock, label: 'Início' },
            { id: 'agenda', icon: Calendar, label: 'Agenda' },
            { id: 'clients', icon: Users, label: 'Clientes' },
            { id: 'financial', icon: DollarSign, label: 'Financeiro' },
            { id: 'settings', icon: SettingsIcon, label: 'Ajustes' },
          ].map((item: { id: 'dashboard' | 'agenda' | 'clients' | 'financial' | 'settings', icon: any, label: string }) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl p-3 transition-all md:w-full md:flex-row md:gap-4",
                activeTab === item.id ? "vibrant-gradient text-white shadow-[0_0_20px_rgba(0,240,255,0.3)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="h-6 w-6" />
              <span className="text-[10px] font-bold md:text-sm">{item.label}</span>
            </button>
          ))}
          
          <div className="hidden md:mt-auto md:block md:w-full">
            <Button variant="ghost" className="w-full justify-start gap-4" onClick={toggleTheme}>
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              <span>{isDarkMode ? 'Modo Claro' : 'Modo Escuro'}</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pb-24 md:pl-64 md:pb-0">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background/80 p-4 backdrop-blur-md md:p-6">
          <div className="flex items-center gap-4">
            {settings.logo && (
              <img src={settings.logo} alt="Logo" className="h-8 w-8 rounded-md object-contain md:hidden" />
            )}
            <h1 className="text-2xl font-bold capitalize">
              {activeTab === 'dashboard' ? 'Dashboard' : 
               activeTab === 'agenda' ? 'Agenda' : 
               activeTab === 'clients' ? 'Clientes' : 
               activeTab === 'financial' ? 'Financeiro' : 'Configurações'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="md:hidden" onClick={toggleTheme}>
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            {activeTab === 'agenda' && (
              <Button onClick={() => setIsServiceModalOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Novo Serviço
              </Button>
            )}
            {activeTab === 'clients' && (
              <Button onClick={() => setIsClientModalOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Novo Cliente
              </Button>
            )}
            {activeTab === 'financial' && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={generateFinancialReport} className="gap-2">
                  <Download className="h-4 w-4" /> PDF
                </Button>
                <Button onClick={() => setIsFinancialModalOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> Registro
                </Button>
              </div>
            )}
          </div>
        </header>

        <div className="p-4 md:p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Olá, AF CLEAN!</h2>
                    <p className="text-muted-foreground">Aqui está o resumo da sua empresa hoje.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setIsServiceModalOpen(true)} className="gap-2 neon-border">
                      <Plus className="h-4 w-4" /> Novo Agendamento
                    </Button>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  <div className="glass-card rounded-2xl p-6">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Serviços Hoje</p>
                    <h3 className="text-2xl font-bold">{services.filter(s => format(parseISO(s.date), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')).length}</h3>
                  </div>
                  <div className="glass-card rounded-2xl p-6">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Receita Mensal</p>
                    <h3 className="text-2xl font-bold">R$ {financials.filter(f => f.type === 'income' && format(parseISO(f.date), 'MM') === format(new Date(), 'MM')).reduce((sum, f) => sum + f.amount, 0).toFixed(2)}</h3>
                  </div>
                  <div className="glass-card rounded-2xl p-6">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Lucro Mensal</p>
                    <h3 className="text-2xl font-bold">
                      R$ {(
                        financials.filter(f => f.type === 'income' && format(parseISO(f.date), 'MM') === format(new Date(), 'MM')).reduce((sum, f) => sum + f.amount, 0) -
                        financials.filter(f => f.type === 'expense' && format(parseISO(f.date), 'MM') === format(new Date(), 'MM')).reduce((sum, f) => sum + f.amount, 0)
                      ).toFixed(2)}
                    </h3>
                  </div>
                  <div className="glass-card rounded-2xl p-6">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                      <Users className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Total Clientes</p>
                    <h3 className="text-2xl font-bold">{clients.length}</h3>
                  </div>
                  <div className="glass-card rounded-2xl p-6">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Concluídos</p>
                    <h3 className="text-2xl font-bold">{services.filter(s => s.status === 'completed').length}</h3>
                  </div>
                </div>

                {services.length === 0 && clients.length === 0 && (
                  <div className="mb-8 glass-card rounded-2xl p-12 text-center">
                    <h3 className="text-xl font-bold mb-2">Bem-vindo ao AF CLEAN Manager!</h3>
                    <p className="text-muted-foreground mb-6">Comece cadastrando seu primeiro cliente e agendando um serviço.</p>
                    <div className="flex justify-center gap-4">
                      <Button onClick={() => setIsClientModalOpen(true)}>Cadastrar Cliente</Button>
                      <Button variant="outline" onClick={() => setIsServiceModalOpen(true)}>Agendar Serviço</Button>
                    </div>
                  </div>
                )}

                <div className="grid gap-8 lg:grid-cols-3">
                  <div className="glass-card rounded-2xl p-6">
                    <h3 className="mb-4 text-lg font-bold">Confirmar para Amanhã</h3>
                    <div className="space-y-4">
                      {services.filter(s => s.status === 'scheduled' && isTomorrow(parseISO(s.date))).map(service => (
                        <div key={service.id} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                          <div>
                            <p className="font-bold">{service.client_name}</p>
                            <p className="text-xs text-muted-foreground">{format(parseISO(service.date), "HH:mm")}</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => sendWhatsAppConfirmation(service)} className="gap-2">
                            <MessageSquare className="h-3 w-3 text-emerald-500" /> Confirmar
                          </Button>
                        </div>
                      ))}
                      {services.filter(s => s.status === 'scheduled' && isTomorrow(parseISO(s.date))).length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhum serviço para confirmar amanhã.</p>
                      )}
                    </div>
                  </div>

                  <div className="glass-card rounded-2xl p-6">
                    <h3 className="mb-4 text-lg font-bold">Próximos Serviços</h3>
                    <div className="space-y-4">
                      {services.filter(s => s.status !== 'completed').slice(0, 3).map(service => (
                        <div key={service.id} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                          <div>
                            <p className="font-bold">{service.client_name}</p>
                            <p className="text-xs text-muted-foreground">{format(parseISO(service.date), "HH:mm ' - ' dd/MM")}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setActiveService(service)}>Ver</Button>
                        </div>
                      ))}
                      {services.filter(s => s.status !== 'completed').length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhum serviço pendente.</p>
                      )}
                    </div>
                  </div>

                  <div className="glass-card rounded-2xl p-6">
                    <h3 className="mb-4 text-lg font-bold">Lembretes de Retorno</h3>
                    <div className="space-y-4">
                      {clients.filter(c => c.next_reminder_date && isAfter(new Date(), parseISO(c.next_reminder_date))).slice(0, 3).map(client => (
                        <div key={client.id} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                          <div>
                            <p className="font-bold">{client.name}</p>
                            <p className="text-xs text-destructive font-medium">Vencido em {format(parseISO(client.next_reminder_date!), 'dd/MM/yyyy')}</p>
                          </div>
                          <a href={`https://wa.me/55${client.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer">
                            <Button variant="outline" size="sm" className="gap-2">
                              <MessageSquare className="h-3 w-3 text-emerald-500" /> WhatsApp
                            </Button>
                          </a>
                        </div>
                      ))}
                      {clients.filter(c => c.next_reminder_date && isAfter(new Date(), parseISO(c.next_reminder_date))).length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhum lembrete para hoje.</p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'agenda' && (
              <motion.div
                key="agenda"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Simple Calendar View */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="glass-card rounded-2xl p-6">
                    <h3 className="mb-4 text-lg font-bold">Agenda do Dia {format(selectedDay || new Date(), 'dd/MM/yyyy')}</h3>
                    {services.filter(s => isSameDay(parseISO(s.date), selectedDay || new Date())).length === 0 ? (
                      <p className="text-muted-foreground">Nenhum serviço agendado para hoje.</p>
                    ) : (
                      <div className="space-y-4">
                        {services.filter(s => isSameDay(parseISO(s.date), selectedDay || new Date())).map(service => (
                          <div key={service.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
                            <div>
                              <p className="font-bold">{service.client_name}</p>
                              <p className="text-sm text-muted-foreground">{format(parseISO(service.date), 'HH:mm')}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="icon" onClick={() => setActiveService(service)}>
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => { setEditingService(service); setIsServiceModalOpen(true); }}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={async () => {
                                if(confirm('Excluir agendamento?')) {
                                  await fetch(`/api/services/${service.id}`, { method: 'DELETE' });
                                  fetchData();
                                }
                              }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="glass-card rounded-2xl p-6">
                    <h3 className="mb-4 text-lg font-bold">Calendário</h3>
                    <DayPicker
                      mode="single"
                      selected={selectedDay}
                      onSelect={setSelectedDay}
                      locale={ptBR}
                      showOutsideDays
                      modifiersStyles={{
                        today: { borderColor: 'var(--primary)', borderWidth: '2px' },
                        selected: { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }
                      }}
                    />
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {services.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Calendar className="mb-4 h-12 w-12 opacity-20" />
                    <p>Nenhum serviço agendado.</p>
                  </div>
                ) : (
                  services.map((service) => (
                    <div key={service.id} className="glass-card relative overflow-hidden rounded-2xl p-6 shadow-sm transition-all hover:shadow-md">
                      <div className="mb-4 flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-bold">{service.client_name}</h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {format(parseISO(service.date), "dd 'de' MMMM, HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <span className={cn(
                          "rounded-full px-2 py-1 text-[10px] font-bold uppercase",
                          service.status === 'completed' ? "bg-emerald-500/10 text-emerald-500" : 
                          service.status === 'in_progress' ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500"
                        )}>
                          {service.status === 'completed' ? 'Concluído' : service.status === 'in_progress' ? 'Em Andamento' : 'Agendado'}
                        </span>
                      </div>
                      
                      <div className="mb-6 space-y-2 text-sm">
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(service.client_address)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          <MapPin className="h-4 w-4 text-muted-foreground" /> {service.client_address}
                        </a>
                        <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {service.client_phone}</p>
                        <p className="flex items-center gap-2 font-bold text-primary"><DollarSign className="h-4 w-4" /> R$ {service.value.toFixed(2)}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {service.status !== 'completed' && (
                          <Button 
                            className="flex-1 gap-2" 
                            onClick={() => setActiveService(service)}
                          >
                            {service.status === 'scheduled' ? 'Iniciar' : 'Continuar'}
                          </Button>
                        )}
                        {service.status === 'completed' && (
                          <Button variant="outline" className="flex-1 gap-2" onClick={() => generateInvoice(service)}>
                            <FileText className="h-4 w-4" /> Recibo
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => { setEditingService(service); setIsServiceModalOpen(true); }}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => {
                          if(confirm('Excluir este serviço?')) {
                            await fetch(`/api/services/${service.id}`, { method: 'DELETE' });
                            fetchData();
                          }
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <a 
                          href={`https://wa.me/55${service.client_phone.replace(/\D/g,'')}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                        >
                          <MessageSquare className="h-4 w-4 text-emerald-500" />
                        </a>
                      </div>
                    </div>
                  ))
                )}
                </div>
              </motion.div>
            )}

            {activeTab === 'clients' && (
              <motion.div
                key="clients"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {clients.map(client => (
                  <div key={client.id} className="glass-card flex items-center justify-between rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="vibrant-gradient flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white">
                        {client.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold">{client.name}</h3>
                        <p className="text-sm text-muted-foreground">{client.phone}</p>
                        {client.next_reminder_date && (
                          <p className={cn(
                            "mt-1 text-xs font-medium",
                            isAfter(new Date(), parseISO(client.next_reminder_date)) ? "text-destructive" : "text-emerald-500"
                          )}>
                            Próxima limpeza: {format(parseISO(client.next_reminder_date), 'dd/MM/yyyy')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingClient(client); setIsClientModalOpen(true); }}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <a href={`tel:${client.phone}`} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground">
                        <Phone className="h-4 w-4" />
                      </a>
                      <a 
                        href={`https://wa.me/55${client.phone.replace(/\D/g,'')}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                      >
                        <MessageSquare className="h-4 w-4 text-emerald-500" />
                      </a>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {activeTab === 'financial' && (
              <motion.div
                key="financial"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-8"
              >
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="glass-card rounded-2xl p-6">
                    <p className="text-sm text-muted-foreground">Entradas (Mês)</p>
                    <h2 className="text-3xl font-bold text-emerald-500">
                      R$ {financials.filter(f => f.type === 'income').reduce((sum, f) => sum + f.amount, 0).toFixed(2)}
                    </h2>
                  </div>
                  <div className="glass-card rounded-2xl p-6">
                    <p className="text-sm text-muted-foreground">Saídas (Mês)</p>
                    <h2 className="text-3xl font-bold text-destructive">
                      R$ {financials.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount, 0).toFixed(2)}
                    </h2>
                  </div>
                  <div className="vibrant-gradient rounded-2xl p-6 text-white">
                    <p className="text-sm opacity-80">Lucro Líquido</p>
                    <h2 className="text-3xl font-bold">
                      R$ {(financials.filter(f => f.type === 'income').reduce((sum, f) => sum + f.amount, 0) - financials.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount, 0)).toFixed(2)}
                    </h2>
                  </div>
                </div>

                <div className="glass-card rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">Resumo por Mês</h3>
                    <Button variant="outline" size="sm" onClick={generateMonthlyFinancialReport} className="gap-2">
                      <Download className="h-4 w-4" /> PDF Mensal
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(
                      financials.reduce((acc: any, f) => {
                        const month = format(parseISO(f.date), 'MMMM yyyy', { locale: ptBR });
                        if (!acc[month]) acc[month] = { income: 0, expense: 0 };
                        if (f.type === 'income') acc[month].income += f.amount;
                        else acc[month].expense += f.amount;
                        return acc;
                      }, {})
                    ).map(([month, totals]: [string, any]) => (
                      <div key={month} className="rounded-xl border border-border bg-muted/30 p-4">
                        <p className="mb-2 font-bold capitalize">{month}</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-emerald-500">Entradas: R$ {totals.income.toFixed(2)}</span>
                          <span className="text-destructive">Saídas: R$ {totals.expense.toFixed(2)}</span>
                        </div>
                        <div className="mt-2 border-t border-border pt-2 text-right font-bold">
                          Lucro: R$ {(totals.income - totals.expense).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card overflow-hidden rounded-2xl overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-6 py-4">Data</th>
                        <th className="px-6 py-4">Descrição</th>
                        <th className="px-6 py-4">Categoria</th>
                        <th className="px-6 py-4 text-right">Valor</th>
                        <th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {financials.map(record => (
                        <tr key={record.id} className="hover:bg-accent/50">
                          <td className="px-6 py-4 text-sm">{format(parseISO(record.date), 'dd/MM/yyyy')}</td>
                          <td className="px-6 py-4 text-sm font-medium">{record.description}</td>
                          <td className="px-6 py-4 text-sm">{record.category}</td>
                          <td className={cn(
                            "px-6 py-4 text-right text-sm font-bold",
                            record.type === 'income' ? "text-emerald-500" : "text-destructive"
                          )}>
                            {record.type === 'income' ? '+' : '-'} R$ {record.amount.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" onClick={() => { setEditingFinancial(record); setIsFinancialModalOpen(true); }}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={async () => {
                                if(confirm('Excluir registro?')) {
                                  await fetch(`/api/financials/${record.id}`, { method: 'DELETE' });
                                  fetchData();
                                }
                              }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-2xl space-y-8"
              >
                <div className="glass-card rounded-2xl p-8">
                  <h3 className="mb-6 text-lg font-bold">Personalização</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="mb-2 block text-sm font-medium">Logo da Empresa</label>
                      <div className="flex items-center gap-6">
                        <div className="vibrant-gradient flex h-24 w-24 items-center justify-center rounded-2xl overflow-hidden">
                          {settings.logo ? (
                            <img src={settings.logo} alt="Logo" className="h-full w-full object-contain" />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-white opacity-50" />
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <input 
                            type="file" 
                            id="logo-upload" 
                            className="hidden" 
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  const img = new Image();
                                  img.src = reader.result as string;
                                  img.onload = async () => {
                                    const canvas = document.createElement('canvas');
                                    const MAX_WIDTH = 256;
                                    const MAX_HEIGHT = 256;
                                    let width = img.width;
                                    let height = img.height;

                                    if (width > height) {
                                      if (width > MAX_WIDTH) {
                                        height *= MAX_WIDTH / width;
                                        width = MAX_WIDTH;
                                      }
                                    } else {
                                      if (height > MAX_HEIGHT) {
                                        width *= MAX_HEIGHT / height;
                                        height = MAX_HEIGHT;
                                      }
                                    }

                                    canvas.width = width;
                                    canvas.height = height;
                                    const ctx = canvas.getContext('2d');
                                    ctx?.drawImage(img, 0, 0, width, height);
                                    const resizedBase64 = canvas.toDataURL('image/png');

                                    await fetch('/api/settings', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ key: 'logo', value: resizedBase64 })
                                    });
                                    fetchData();
                                  };
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                          <div className="flex gap-2">
                            <Button onClick={() => document.getElementById('logo-upload')?.click()}>Trocar Logo</Button>
                            {settings.logo && (
                              <Button variant="outline" className="text-destructive" onClick={async () => {
                                await fetch('/api/settings', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ key: 'logo', value: '' })
                                });
                                fetchData();
                              }}>Remover</Button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Recomendado: PNG transparente, 256x256px.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="glass-card rounded-2xl p-8">
                  <h3 className="mb-6 text-lg font-bold">Informações da Empresa</h3>
                  <form onSubmit={handleSaveCompanyInfo} className="space-y-4">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Nome da Empresa</label>
                      <Input 
                        value={companyInfo.name}
                        onChange={(e) => setCompanyInfo({ ...companyInfo, name: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">WhatsApp para Contato</label>
                      <Input 
                        value={companyInfo.whatsapp}
                        onChange={(e) => setCompanyInfo({ ...companyInfo, whatsapp: e.target.value })}
                      />
                    </div>
                    <Button type="submit" className="w-full">Salvar Alterações</Button>
                  </form>
                </div>

                <div className="glass-card rounded-2xl p-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold">Notificações Push</h3>
                      <p className="text-sm text-muted-foreground">Lembrar de serviços 24h antes</p>
                    </div>
                    <button
                      onClick={() => togglePushNotifications(!settings.push_notifications_enabled)}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        settings.push_notifications_enabled ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                          settings.push_notifications_enabled ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Service Workflow Modal */}
      <AnimatePresence>
        {activeService && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-card h-full max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-8 shadow-2xl"
            >
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Execução de Serviço</h2>
                  <p className="text-muted-foreground">{activeService.client_name}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setActiveService(null)}>
                  <X className="h-6 w-6" />
                </Button>
              </div>

              <div className="space-y-8">
                {/* Step 1: Before Photo */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full font-bold",
                      activeService.photos_before && activeService.photos_before.length > 0 ? "bg-emerald-500 text-white" : "bg-primary text-white"
                    )}>
                      1
                    </div>
                    <h3 className="text-lg font-bold">Check-list (Fotos Antes)</h3>
                  </div>
                  
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {(activeService.photos_before || []).map((photo, idx) => (
                        <div key={idx} className="relative aspect-square overflow-hidden rounded-xl bg-muted border">
                          <img src={photo} alt={`Antes ${idx}`} className="h-full w-full object-cover" />
                          <button 
                            onClick={() => {
                              const newPhotos = (activeService.photos_before || []).filter((_, i) => i !== idx);
                              handleUpdateServiceStatus(activeService.id, { photos_before: newPhotos });
                            }}
                            className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-white shadow-lg"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => document.getElementById('photo-before')?.click()}
                        className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <Plus className="h-6 w-6 text-muted-foreground" />
                        <span className="text-[10px] font-bold text-muted-foreground">Adicionar</span>
                      </button>
                    </div>
                    <input type="file" id="photo-before" className="hidden" accept="image/*" capture="environment" onChange={(e) => handlePhotoUpload(e, 'before')} />
                    <p className="text-xs text-muted-foreground text-center">Registre o estado inicial do estofado (múltiplas fotos permitidas).</p>
                  </div>
                </div>

                {/* Step 2: In Progress */}
                {(activeService.photos_before || []).length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full font-bold",
                        activeService.status === 'in_progress' || activeService.status === 'completed' ? "bg-emerald-500 text-white" : "bg-primary text-white"
                      )}>
                        2
                      </div>
                      <h3 className="text-lg font-bold">Execução</h3>
                    </div>
                    {activeService.status === 'scheduled' ? (
                      <Button className="w-full py-6 text-lg" onClick={() => handleUpdateServiceStatus(activeService.id, { status: 'in_progress' })}>
                        Iniciar Limpeza Agora
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 text-emerald-500 font-bold">
                        <Clock className="animate-pulse" /> Limpeza em andamento...
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Step 3: After Photo */}
                {activeService.status === 'in_progress' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full font-bold",
                        activeService.photos_after && activeService.photos_after.length > 0 ? "bg-emerald-500 text-white" : "bg-primary text-white"
                      )}>
                        3
                      </div>
                      <h3 className="text-lg font-bold">Resultado (Fotos Depois)</h3>
                    </div>
                    
                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        {(activeService.photos_after || []).map((photo, idx) => (
                          <div key={idx} className="relative aspect-square overflow-hidden rounded-xl bg-muted border">
                            <img src={photo} alt={`Depois ${idx}`} className="h-full w-full object-cover" />
                            <button 
                              onClick={() => {
                                const newPhotos = (activeService.photos_after || []).filter((_, i) => i !== idx);
                                handleUpdateServiceStatus(activeService.id, { photos_after: newPhotos });
                              }}
                              className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-white shadow-lg"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <button 
                          onClick={() => document.getElementById('photo-after')?.click()}
                          className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <Plus className="h-6 w-6 text-muted-foreground" />
                          <span className="text-[10px] font-bold text-muted-foreground">Adicionar</span>
                        </button>
                      </div>
                      <input type="file" id="photo-after" className="hidden" accept="image/*" capture="environment" onChange={(e) => handlePhotoUpload(e, 'after')} />
                    </div>
                  </motion.div>
                )}

                {/* Step 4: Payment & Signature */}
                {activeService.photos_after && activeService.photos_after.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-bold text-white">4</div>
                      <h3 className="text-lg font-bold">Finalização</h3>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Forma de Pagamento</label>
                        <select id="payment_method" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                          <option value="Pix">Pix</option>
                          <option value="Cartão de Crédito">Cartão de Crédito</option>
                          <option value="Cartão de Débito">Cartão de Débito</option>
                          <option value="Dinheiro">Dinheiro</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Parcelas</label>
                        <Input id="installments" type="number" defaultValue="1" min="1" max="12" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Assinatura do Cliente</label>
                      <div className="rounded-2xl border-2 border-dashed bg-white p-2">
                        <SignaturePad 
                          ref={sigPad}
                          penColor='black'
                          canvasProps={{ className: 'w-full h-40 touch-none' }}
                        />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => sigPad.current?.clear()}>Limpar Assinatura</Button>
                    </div>

                    <Button className="w-full py-8 text-xl font-bold shadow-xl" onClick={handleFinishService}>
                      Finalizar e Gerar Recibo
                    </Button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals for CRUD */}
      <AnimatePresence>
        {isServiceModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
            <motion.form 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onSubmit={handleSaveService}
              className="glass-card w-full max-w-md rounded-3xl p-4 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="mb-6 text-xl font-bold">{editingService ? 'Editar Agendamento' : 'Novo Agendamento'}</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cliente</label>
                  <div className="relative">
                    <Input 
                      placeholder="Pesquisar cliente..." 
                      className="mb-2"
                      value={clients.find(c => c.id === selectedClientId)?.name || ''}
                      onChange={(e) => {
                        const term = e.target.value.toLowerCase();
                        const foundClient = clients.find(c => c.name.toLowerCase().includes(term));
                        setSelectedClientId(foundClient?.id);
                      }}
                    />
                    <select 
                      id="client-select" 
                      name="client_id" 
                      required 
                      value={selectedClientId || ''}
                      onChange={(e) => setSelectedClientId(parseInt(e.target.value))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Selecione um cliente</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data e Hora</label>
                  <DayPicker
                    mode="single"
                    selected={selectedDay}
                    onSelect={setSelectedDay}
                    locale={ptBR}
                    className="rdp-custom-styles"
                    footer={
                      <Input 
                        type="time" 
                        name="time" 
                        required 
                        defaultValue={editingService?.date ? format(parseISO(editingService.date), 'HH:mm') : format(new Date(), 'HH:mm')}
                        className="mt-2"
                      />
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Valor Estimado (R$)</label>
                  <Input name="value" type="number" step="0.01" required defaultValue={editingService?.value} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Forma de Pagamento</label>
                    <select name="payment_method" defaultValue={editingService?.payment_method} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="Pix">Pix</option>
                      <option value="Cartão de Crédito">Cartão de Crédito</option>
                      <option value="Cartão de Débito">Cartão de Débito</option>
                      <option value="Dinheiro">Dinheiro</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Parcelas</label>
                    <Input name="installments" type="number" defaultValue={editingService?.installments || 1} min="1" max="12" />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setIsServiceModalOpen(false)}>Cancelar</Button>
                  <Button type="submit" className="flex-1">Salvar</Button>
                </div>
              </div>
            </motion.form>
          </div>
        )}

        {isClientModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
            <motion.form 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onSubmit={handleSaveClient}
              className="glass-card w-full max-w-md rounded-3xl p-8 shadow-2xl"
            >
              <h2 className="mb-6 text-xl font-bold">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome Completo</label>
                  <Input name="name" required defaultValue={editingClient?.name} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Endereço</label>
                  <Input name="address" required defaultValue={editingClient?.address} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Telefone / WhatsApp</label>
                  <Input name="phone" required defaultValue={editingClient?.phone} />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setIsClientModalOpen(false)}>Cancelar</Button>
                  <Button type="submit" className="flex-1">Salvar</Button>
                </div>
              </div>
            </motion.form>
          </div>
        )}

        {isFinancialModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
            <motion.form 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onSubmit={handleSaveFinancial}
              className="glass-card w-full max-w-md rounded-3xl p-8 shadow-2xl"
            >
              <h2 className="mb-6 text-xl font-bold">{editingFinancial ? 'Editar Registro' : 'Novo Registro Financeiro'}</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipo</label>
                  <select name="type" defaultValue={editingFinancial?.type || 'income'} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="income">Entrada (Lucro)</option>
                    <option value="expense">Saída (Gasto)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Descrição</label>
                  <Input name="description" defaultValue={editingFinancial?.description} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Valor (R$)</label>
                  <Input name="amount" type="number" step="0.01" defaultValue={editingFinancial?.amount} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data</label>
                  <Input name="date" type="date" required defaultValue={editingFinancial?.date ? format(parseISO(editingFinancial.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Categoria</label>
                  <Input name="category" defaultValue={editingFinancial?.category} placeholder="Ex: Produtos, Combustível, Marketing" />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setIsFinancialModalOpen(false); setEditingFinancial(null); }}>Cancelar</Button>
                  <Button type="submit" className="flex-1">Salvar</Button>
                </div>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
