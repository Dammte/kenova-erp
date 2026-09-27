import { useState } from "react";
import styles from "./page.module.css";

function RepairPage() {
    const [primer, setPrimer] = useState(true);
    const [segundo, setSegundo] = useState(false);
    const [tercer, setTercer] = useState(false);


    const changePress = (number: number) => {
        switch (number) {
            case 1:
                setPrimer(true);
                setSegundo(false);
                setTercer(false);
                break;
            case 2:
                setPrimer(false);
                setSegundo(true);
                setTercer(false);
                break;
            case 3:
                setPrimer(false);
                setSegundo(false);
                setTercer(true);
                break;
        }
    }

    return (
        <section className={styles.repair}>
            <div className={styles.repairText}>
                <h1>¿Estás listo para utilizar nuestros servicios?</h1>
                <h2>Ofrecemos</h2>
            </div>
            <div className={styles.table}>
                <div className={styles.tableOptions}>
                    <button onClick={() => changePress(1)}>
                        Primer
                    </button>
                    <button onClick={() => changePress(2)}>
                        Segundo
                    </button>
                    <button onClick={() => changePress(3)}>
                        Tercer
                    </button>
                </div>
                <div className={styles.tableContent}>
                    {primer && (
                        <div className={styles.tableContentText}>
                            <h1>TEXTO 1</h1>
                            <p>Contenido de cada servicio</p>
                        </div>
                    )}
                    {segundo && (
                        <div className={styles.tableContentText}>
                            <h1>TEXTO 2</h1>
                            <p>Contenido de cada servicio</p>
                        </div>
                    )}
                    {tercer && (
                        <div className={styles.tableContentText}>
                            <h1>TEXTO 3</h1>
                            <p>Contenido de cada servicio</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default RepairPage;