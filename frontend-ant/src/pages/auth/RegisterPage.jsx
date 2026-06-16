import { useState } from 'react';
import { registerUser } from '../../services/api';
import Button from '../../components/ui/Button'; 

export default function RegisterPage() {
    const [formData, setFormData] = useState({
        nombre: '',
        apellido: '',
        nombreUsuario: '',
        email: '',
        password: ''
    });
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({
        ...formData,
        [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await registerUser(formData);
            setSuccess(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
        <div style={styles.container}>
            <h2 style={styles.heading}>¡Registro Exitoso!</h2>
            <p>Por favor, revisá tu correo electrónico para confirmar tu cuenta y poder iniciar sesión.</p>
        </div>
        );
    }

    return (
        <div style={styles.container}>
            <h2 style={styles.heading}>Registrarse en Cyanea</h2>
            <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.row}>
                    <div style={styles.field}>
                        <label style={styles.label}>Nombre</label>
                        <input
                            type="text"
                            name="nombre"
                            value={formData.nombre}
                            onChange={handleChange}
                            required
                            style={styles.input}
                        />
                    </div>
                    <div style={styles.field}>
                        <label style={styles.label}>Apellido</label>
                        <input
                            type="text"
                            name="apellido"
                            value={formData.apellido}
                            onChange={handleChange}
                            required
                            style={styles.input}
                        />
                    </div>
                </div>

                <div style={styles.field}>
                    <label style={styles.label}>Nombre de Usuario</label>
                    <input
                        type="text"
                        name="nombreUsuario"
                        value={formData.nombreUsuario}
                        onChange={handleChange}
                        required
                        style={styles.input}
                    />
                </div>

                <div style={styles.field}>
                    <label style={styles.label}>Correo electrónico</label>
                    <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        placeholder="usuario@ejemplo.com"
                        style={styles.input}
                    />
                </div>

                <div style={styles.field}>
                    <label style={styles.label}>Contraseña</label>
                    <input
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        placeholder="••••••••"
                        style={styles.input}
                    />
                </div>

                {error && <div style={styles.errorBox}>{error}</div>}

                <div style={styles.buttonContainer}>
                    <Button type="submit" disabled={loading}>
                        {loading ? 'Registrando...' : 'Crear Cuenta'}
                    </Button>
                </div>
            </form>
        </div>
    );
}

// Estilos básicos
const styles = {
    container: { maxWidth: '500px', margin: '2rem auto', padding: '2rem', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    heading: { textAlign: 'center', marginBottom: '1.5rem', color: '#333' },
    form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
    row: { display: 'flex', gap: '1rem' },
    field: { display: 'flex', flexDirection: 'column', flex: 1, gap: '0.4rem' },
    label: { fontSize: '0.9rem', fontWeight: 'bold', color: '#555' },
    input: { padding: '0.6rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '1rem' },
    errorBox: { padding: '0.8rem', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontSize: '0.9rem', textAlign: 'center' },
    buttonContainer: { marginTop: '1rem', display: 'flex', justifyContent: 'center' }
};