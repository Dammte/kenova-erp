export const tiposDispositivos = [
    { id: 'movil', nombre: 'Móvil', icon: 'Phone' },
    { id: 'tablet', nombre: 'Tablet', icon: 'Tablet' },
    { id: 'computador', nombre: 'Computador', icon: 'Laptop' }
];

export const marcasPorTipo = {
    movil: ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Oppo', 'Otro'],
    tablet: ['Apple', 'Samsung', 'Lenovo', 'Huawei', 'Otro'],
    computador: ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Otro']
};

export const modelosPorMarca = {
    Apple: {
        movil: ['iPhone 15 Pro', 'iPhone 15', 'iPhone 14 Pro', 'iPhone 14', 'iPhone 13', 'iPhone SE', 'Otro'],
        tablet: ['iPad Pro', 'iPad Air', 'iPad', 'iPad Mini', 'Otro'],
        computador: ['MacBook Pro', 'MacBook Air', 'iMac', 'Mac Mini', 'Mac Studio', 'Otro']
    },
    Samsung: {
        movil: ['Galaxy S23', 'Galaxy S22', 'Galaxy A54', 'Galaxy A34', 'Galaxy Z Fold', 'Galaxy Z Flip', 'Otro'],
        tablet: ['Galaxy Tab S9', 'Galaxy Tab S8', 'Galaxy Tab A8', 'Otro'],
        computador: ['Galaxy Book', 'Galaxy Book Pro', 'Otro']
    },
    Xiaomi: {
        movil: ['Redmi Note 12', 'Redmi Note 11', 'POCO F5', 'POCO X5', 'Mi 13', 'Mi 12', 'Otro'],
        tablet: ['Redmi Pad', 'Mi Pad 5', 'Otro']
    },
    Huawei: {
        movil: ['P40 Pro', 'P40', 'Mate 40', 'Nova 9', 'Otro'],
        tablet: ['MatePad Pro', 'MatePad 11', 'MatePad T', 'Otro'],
        computador: ['MateBook X Pro', 'MateBook 14', 'MateBook D', 'Otro']
    },
};