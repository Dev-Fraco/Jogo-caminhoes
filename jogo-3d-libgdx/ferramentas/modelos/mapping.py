# Mapeamento: osso da personagem nova (CC_Base_*) -> osso do esqueleto do Jake
MAP = {
 'RL_BoneRoot':'CC_Base_BoneRoot','CC_Base_Hip':'Hips','CC_Base_Pelvis':'CC_Base_Pelvis',
 'CC_Base_L_Thigh':'LeftUpperLeg','CC_Base_L_Calf':'LeftLowerLeg','CC_Base_L_Foot':'LeftFoot','CC_Base_L_ToeBase':'LeftToeBase',
 'CC_Base_R_Thigh':'RightUpperLeg','CC_Base_R_Calf':'RightLowerLeg','CC_Base_R_Foot':'RightFoot','CC_Base_R_ToeBase':'RightToeBase',
 'CC_Base_Waist':'Spine','CC_Base_Spine01':'Spine1','CC_Base_Spine02':'Spine2','CC_Base_NeckTwist01':'Neck','CC_Base_Head':'Head',
 'CC_Base_L_Clavicle':'LeftShoulder','CC_Base_L_Upperarm':'LeftArm','CC_Base_L_Forearm':'LeftForeArm','CC_Base_L_Hand':'LeftHand',
 'CC_Base_R_Clavicle':'RightShoulder','CC_Base_R_Upperarm':'RightUpperArm','CC_Base_R_Forearm':'RightForeArm','CC_Base_R_Hand':'RightHand',
}
for side,jside in (('L','Left'),('R','Right')):
    for fing,jfing in (('Pinky','Pinky'),('Ring','Ring'),('Mid','Middle'),('Index','Index'),('Thumb','Thumb')):
        for k in (1,2,3):
            MAP[f'CC_Base_{side}_{fing}{k}'] = f'{jside}Hand{jfing}{k}'
