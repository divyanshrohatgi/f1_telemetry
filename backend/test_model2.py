import joblib, glob 
for f in glob.glob('ml/saved_models/*.pkl'): 
    m = joblib.load(f) 
    enc = m.get('circuit_encoder') 
    print(f) 
    print('Features:', m.get('feature_columns')) 
    if enc: print('Circuits:', list(enc.classes_)[:10]) 
